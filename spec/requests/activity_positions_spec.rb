require "rails_helper"

RSpec.describe "ActivityPositions", type: :request do
  def login_as(user)
    post "/login_test", params: { user_id: user.id }
  end

  let(:author) { create(:user) }
  let(:tour)   { create(:tour, author: author) }

  it "PATCH moves activity between days and redirects to the tour" do
    day1 = create(:day, tour: tour, day_index: 1)
    day2 = create(:day, tour: tour, day_index: 2)
    a = create(:activity, tour: tour, day: day1, position: 1)
    login_as(author)
    patch activity_position_path(a), params: { to_day_id: day2.id, to_position: 1 }
    expect(response).to redirect_to(tour_path(tour))
    expect(a.reload.day_id).to eq(day2.id)
  end

  it "PATCH moves to backlog when to_day_id blank" do
    day = create(:day, tour: tour)
    a = create(:activity, tour: tour, day: day, position: 1)
    login_as(author)
    patch activity_position_path(a), params: { to_position: 1 }
    expect(a.reload.day_id).to be_nil
    expect(response).to redirect_to(tour_path(tour))
  end

  it "non-editor is forbidden" do
    a = create(:activity, tour: tour)
    login_as(create(:user))
    patch activity_position_path(a), params: { to_position: 1 }
    expect(response).to have_http_status(:forbidden)
  end
end
