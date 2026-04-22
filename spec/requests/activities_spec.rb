require "rails_helper"

RSpec.describe "Activities", type: :request do
  def login_as(user)
    post "/login_test", params: { user_id: user.id }
  end

  let(:author) { create(:user) }
  let(:tour)   { create(:tour, author: author) }

  it "POST creates activity in a day" do
    day = create(:day, tour: tour, day_index: 2)
    login_as(author)
    expect {
      post tour_day_activities_path(tour, day), params: {
        activity: { name: "景点", kind: "scenic", citizen_level: "tier_one" }
      }
    }.to change(Activity, :count).by(1)
    expect(Activity.last.day_id).to eq(day.id)
  end

  it "POST creates backlog activity" do
    login_as(author)
    expect {
      post tour_backlog_activities_path(tour), params: {
        activity: { name: "待定", kind: "scenic", citizen_level: "tier_three" }
      }
    }.to change(Activity, :count).by(1)
    expect(Activity.last.day_id).to be_nil
  end

  it "PATCH updates activity" do
    a = create(:activity, tour: tour, name: "旧")
    login_as(author)
    patch activity_path(a), params: { activity: { name: "新" } }
    expect(a.reload.name).to eq("新")
  end

  it "DELETE destroys activity" do
    a = create(:activity, tour: tour)
    login_as(author)
    expect { delete activity_path(a) }.to change(Activity, :count).by(-1)
  end

  it "non-editor is forbidden" do
    other = create(:user)
    a = create(:activity, tour: tour)
    login_as(other)
    delete activity_path(a)
    expect(response).to have_http_status(:forbidden)
  end

  it "PATCH saves desc and ignores tips" do
    a = create(:activity, tour: tour, name: "旧", desc: "")
    login_as(author)
    patch activity_path(a), params: {
      activity: { desc: "新备注", tips: "should be ignored" }
    }
    a.reload
    expect(a.desc).to eq("新备注")
    expect(Activity.column_names).not_to include("tips")
  end

  describe "POST create with Accept: application/json" do
    it "returns id and position in JSON for day-scoped create" do
      day = create(:day, tour: tour, day_index: 2)
      login_as(author)
      post tour_day_activities_path(tour, day),
        params: { activity: { name: "新景点", kind: "scenic", citizen_level: "tier_one" } },
        headers: { "Accept" => "application/json" }
      expect(response).to have_http_status(:ok)
      body = JSON.parse(response.body)
      expect(body["id"]).to be_a(Integer)
      expect(body["position"]).to be_a(Integer)
    end

    it "returns id for backlog create" do
      login_as(author)
      post tour_backlog_activities_path(tour),
        params: { activity: { name: "待选", kind: "scenic", citizen_level: "tier_three" } },
        headers: { "Accept" => "application/json" }
      expect(response).to have_http_status(:ok)
      body = JSON.parse(response.body)
      expect(body["id"]).to be_a(Integer)
    end
  end

  describe "POST /activities/:id/clone" do
    it "editor clones and returns JSON { id, position }" do
      day = create(:day, tour: tour, day_index: 2)
      src = create(:activity, tour: tour, day: day, position: 1, name: "酒店")
      login_as(author)

      expect {
        post clone_activity_path(src), headers: { "Accept" => "application/json" }
      }.to change(Activity, :count).by(1)

      expect(response).to have_http_status(:ok)
      body = JSON.parse(response.body)
      expect(body["id"]).to be_a(Integer)
      expect(body["position"]).to eq(2)

      clone = Activity.find(body["id"])
      expect(clone.name).to eq("酒店")
      expect(clone.day_id).to eq(day.id)
    end

    it "non-editor (reader) gets 403" do
      day = create(:day, tour: tour, day_index: 2)
      src = create(:activity, tour: tour, day: day)
      reader = create(:user)
      create(:tour_membership, tour: tour, user: reader, role: :reader)
      login_as(reader)

      expect {
        post clone_activity_path(src), headers: { "Accept" => "application/json" }
      }.not_to change(Activity, :count)

      expect(response).to have_http_status(:forbidden)
    end

    it "unauthenticated user gets redirected to login" do
      src = create(:activity, tour: tour)

      post clone_activity_path(src)

      expect(response).to have_http_status(:found)
      expect(response.location).to include("/login")
    end

    it "returns 404 when the source activity does not exist" do
      login_as(author)

      post "/activities/99999/clone", headers: { "Accept" => "application/json" }

      expect(response).to have_http_status(:not_found)
    end
  end
end
