require "rails_helper"

RSpec.describe "Tours", type: :request do
  def login_as(user)
    post "/login_test", params: { user_id: user.id }
  end

  let(:user) { create(:user) }

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
    it "creates a tour and redirects to its constitution page" do
      login_as(user)
      expect {
        post "/tours", params: { tour: { title: "新伊犁" } }
      }.to change(Tour, :count).by(1)
      tour = Tour.last
      expect(response).to redirect_to(tour_constitution_path(tour))
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

  describe "GET /tours index payload enrichment (I8)" do
    it "includes days_count, activities_count, health, my_role, last_activity_at" do
      tour = create(:tour, author: user)
      day  = create(:day, tour: tour, day_index: 1)
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
