require "rails_helper"

RSpec.describe "Tours::Constitutions", type: :request do
  def login_as(user)
    post "/login_test", params: { user_id: user.id }
  end

  let(:user) { create(:user) }

  it "GET /tours/:id/constitution renders inertia page" do
    tour = create(:tour, author: user)
    login_as(user)
    get tour_constitution_path(tour)
    expect(response).to have_http_status(:ok)
  end

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
end
