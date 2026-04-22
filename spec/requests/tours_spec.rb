require "rails_helper"

RSpec.describe "Tours", type: :request do
  def login_as(user)
    post "/login_test", params: { user_id: user.id }
  end

  # inertia_rails >= 3.20 serialises the page blob into
  #   <script data-page="app" type="application/json">{...}</script>
  def inertia_page_from(body)
    match = body.match(/<script data-page="app" type="application\/json">(.*?)<\/script>/m)
    match or raise "no Inertia <script data-page> block in body"
    JSON.parse(match[1])
  end

  let(:user) { create(:user) }

  describe "inertia_share current_user (BUG #1)" do
    it "embeds current_user into the Inertia page props so the nav layout can read it" do
      login_as(user)
      get "/tours"
      expect(response).to have_http_status(:ok)
      page = inertia_page_from(response.body)
      expect(page.dig("props", "current_user", "id")).to eq(user.id)
      expect(page.dig("props", "current_user", "email")).to eq(user.email)
      expect(page["sharedProps"]).to include("current_user")
    end

    it "shares current_user as null for anonymous visitors (no 500)" do
      get "/login"
      expect(response).to have_http_status(:ok)
      page = inertia_page_from(response.body)
      expect(page.dig("props", "current_user")).to be_nil
    end
  end

  describe "GET /tours" do
    it "lists tours where user is author or member, excluding others" do
      create(:tour, author: user, title: "Mine")
      create(:tour, title: "Other")
      member_tour = create(:tour, title: "Member")
      create(:tour_membership, tour: member_tour, user: user, role: :reader)

      login_as(user)
      get "/tours"
      expect(response).to have_http_status(:ok)
      expect(response.body).to include("Mine")
      expect(response.body).to include("Member")
      expect(response.body).not_to include("Other")
    end
  end

  describe "POST /tours" do
    it "creates a tour and redirects to its show page" do
      login_as(user)
      expect {
        post "/tours", params: { tour: { title: "新伊犁" } }
      }.to change(Tour, :count).by(1)
      tour = Tour.last
      expect(response).to redirect_to(tour_path(tour))
    end
  end

  describe "GET /tours/:id" do
    it "allows author to view" do
      tour = create(:tour, author: user)
      login_as(user)
      get "/tours/#{tour.id}"
      expect(response).to have_http_status(:ok)
    end

    it "denies non-member" do
      tour = create(:tour)
      login_as(user)
      get "/tours/#{tour.id}"
      expect(response).to have_http_status(:not_found)
    end

    it "returns 404 when the tour does not exist (no 500 from nil.visible_to?)" do
      login_as(user)
      get "/tours/9999999"
      expect(response).to have_http_status(:not_found)
    end
  end

  describe "GET /tours/:id props" do
    it "includes members and author in Inertia props" do
      tour = create(:tour, author: user)
      editor = create(:user, email: "editor@test.com")
      create(:tour_membership, tour: tour, user: editor, role: :editor)

      login_as(user)
      get "/tours/#{tour.id}"
      expect(response).to have_http_status(:ok)
      expect(response.body).to include("members")
      expect(response.body).to include("author")
      expect(response.body).to include("editor@test.com")
      expect(response.body).to include("editable_by_current_user")
    end

    it "includes intensity_derived on each day in Inertia props" do
      tour = create(:tour, author: user)
      tour.days.first.update!(buffer_day: true) # D1 seeded by callback
      create(:day, tour: tour, day_index: 2)

      login_as(user)
      get "/tours/#{tour.id}"
      expect(response).to have_http_status(:ok)
      expect(response.body).to include("intensity_derived")
      expect(response.body).to include("green") # buffer_day=true day 1
    end

    it "includes conversation_empty=true for fresh tour with no conversation" do
      tour = create(:tour, author: user)
      login_as(user)
      get "/tours/#{tour.id}"
      expect(response).to have_http_status(:ok)
      expect(response.body).to include('"conversation_empty":true')
    end

    it "includes conversation_empty=false when conversation has messages" do
      tour = create(:tour, author: user)
      conv = tour.conversations.create!(user: user)
      conv.messages.create!(role: :user, content: "hi")
      login_as(user)
      get "/tours/#{tour.id}"
      expect(response).to have_http_status(:ok)
      expect(response.body).to include('"conversation_empty":false')
    end

    it "includes a `summary` Inertia prop shaped like Tour::TimelineSummary.for" do
      tour = create(:tour, author: user)
      login_as(user)
      get "/tours/#{tour.id}"
      expect(response).to have_http_status(:ok)
      page = inertia_page_from(response.body)
      expect(page["props"]).to have_key("summary")
      expect(page["props"]["summary"]).to eq(Tour::TimelineSummary.for(tour).deep_stringify_keys)
    end

    it "includes constitution, defaults, overrides in show props" do
      tour = create(:tour, author: user)
      login_as(user)
      get "/tours/#{tour.id}"
      expect(response).to have_http_status(:ok)
      page = inertia_page_from(response.body)
      expect(page["props"]).to include("constitution", "defaults", "overrides")
    end
  end

  describe "GET /tours/:id — participant_user_ids on activities" do
    it "includes participant_user_ids as empty array for activity without explicit participants" do
      tour = create(:tour, author: user)
      activity = create(:activity, tour: tour)

      login_as(user)
      get "/tours/#{tour.id}"

      expect(response).to have_http_status(:ok)
      page = inertia_page_from(response.body)
      activities = page.dig("props", "activities")
      act = activities.find { |a| a["id"] == activity.id }
      expect(act).not_to be_nil
      expect(act["participant_user_ids"]).to eq([])
    end

    it "includes participant_user_ids with member ids for activity with explicit participants" do
      tour   = create(:tour, author: user)
      member = create(:user)
      create(:tour_membership, tour: tour, user: member, role: :editor)
      activity_with    = create(:activity, tour: tour)
      activity_without = create(:activity, tour: tour)
      ActivityParticipant.create!(activity: activity_with, user: member)

      login_as(user)
      get "/tours/#{tour.id}"

      expect(response).to have_http_status(:ok)
      page = inertia_page_from(response.body)
      activities = page.dig("props", "activities")
      with_act    = activities.find { |a| a["id"] == activity_with.id }
      without_act = activities.find { |a| a["id"] == activity_without.id }
      expect(with_act["participant_user_ids"]).to eq([ member.id ])
      expect(without_act["participant_user_ids"]).to eq([])
    end
  end

  describe "GET /tours index payload enrichment (I8)" do
    it "includes days_count, activities_count, health, my_role, last_activity_at" do
      tour = create(:tour, author: user)
      day  = tour.days.first # D1 seeded by callback
      # Drive a hard tier_one violation: 4 tier_one on the same day > limit 3
      4.times.with_index { |_, i| create(:activity, tour: tour, day: day, citizen_level: :tier_one, position: i + 1) }

      login_as(user)
      get "/tours"
      expect(response).to have_http_status(:ok)
      body = response.body
      expect(body).to include("days_count")
      expect(body).to include("activities_count")
      expect(body).to include("health")
      expect(body).to include("my_role")
      expect(body).to include("last_activity_at")
      expect(body).to include("\"hard\"")
      expect(body).to include("author")
    end

    it "reports my_role='reader' / 'editor' for shared tours" do
      reader_tour = create(:tour)
      editor_tour = create(:tour)
      create(:tour_membership, tour: reader_tour, user: user, role: :reader)
      create(:tour_membership, tour: editor_tour, user: user, role: :editor)

      login_as(user)
      get "/tours"
      expect(response.body).to include("reader")
      expect(response.body).to include("editor")
    end
  end
end
