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
  end
end
