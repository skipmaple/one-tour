require "rails_helper"

RSpec.describe "Timelines", type: :request do
  def login_as(user)
    post "/login_test", params: { user_id: user.id }
  end

  let(:user) { create(:user) }

  describe "GET /tours/:tour_id/timeline" do
    it "renders the timeline page for the author" do
      tour = create(:tour, author: user)
      login_as(user)
      get "/tours/#{tour.id}/timeline"
      expect(response).to have_http_status(:ok)
      expect(response.body).to include("day_count")
      expect(response.body).to include("summary")
    end

    it "allows a reader member to view" do
      tour = create(:tour)
      create(:tour_membership, tour: tour, user: user, role: :reader)
      login_as(user)
      get "/tours/#{tour.id}/timeline"
      expect(response).to have_http_status(:ok)
    end

    it "returns 404 for non-members" do
      tour = create(:tour)
      login_as(user)
      get "/tours/#{tour.id}/timeline"
      expect(response).to have_http_status(:not_found)
    end

    it "returns 404 for nonexistent tour" do
      login_as(user)
      get "/tours/999999/timeline"
      expect(response).to have_http_status(:not_found)
    end

    it "requires login" do
      tour = create(:tour)
      get "/tours/#{tour.id}/timeline"
      expect(response).to redirect_to("/login")
    end
  end
end
