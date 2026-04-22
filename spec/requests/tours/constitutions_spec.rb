require "rails_helper"

RSpec.describe "Tours::Constitutions", type: :request do
  def login_as(user)
    post "/login_test", params: { user_id: user.id }
  end

  let(:user) { create(:user) }

  it "PATCH updates constitution jsonb" do
    tour = create(:tour, author: user)
    login_as(user)
    patch tour_constitution_path(tour), params: { constitution: { max_mountain_road_minutes: 300 } }
    expect(response).to redirect_to(tour)
    expect(tour.reload.constitution["max_mountain_road_minutes"]).to eq("300")
  end

  it "PATCH denies non-author" do
    tour = create(:tour)
    login_as(user)
    patch tour_constitution_path(tour), params: { constitution: { max_tier_one_per_day: 4 } }
    expect(response).to have_http_status(:forbidden)
  end

  # Regression: the GET show + the /tours/:id/timeline GET were retired
  # when planner became the canonical view. Anyone re-adding these routes
  # needs to also revisit ConstitutionDrawer / TimelineOverlay.
  it "GET /tours/:id/constitution returns 404 (route deleted)" do
    tour = create(:tour, author: user)
    login_as(user)
    get "/tours/#{tour.id}/constitution"
    expect(response).to have_http_status(:not_found)
  end

  it "GET /tours/:id/timeline returns 404 (route deleted)" do
    tour = create(:tour, author: user)
    login_as(user)
    get "/tours/#{tour.id}/timeline"
    expect(response).to have_http_status(:not_found)
  end

  describe "POST /tours/:id/constitution/accept" do
    # Tour.validates :title, presence: true, if: :constitution_accepted?
    # means accepting a tour with a blank title would raise
    # ActiveRecord::RecordInvalid → 500 via update!. Controller catches this
    # upfront and returns 422 to JSON / redirects with an alert to HTML.
    it "returns 422 (JSON) when the tour has a blank title" do
      tour = create(:tour, author: user, title: "")
      login_as(user)
      post "/tours/#{tour.id}/constitution/accept", as: :json
      expect(response).to have_http_status(:unprocessable_entity)
      expect(tour.reload.constitution_accepted).to be false
    end

    it "accepts when the tour has a title" do
      tour = create(:tour, author: user, title: "伊犁")
      login_as(user)
      post "/tours/#{tour.id}/constitution/accept", as: :json
      expect(response).to have_http_status(:ok)
      expect(tour.reload.constitution_accepted).to be true
    end
  end
end
