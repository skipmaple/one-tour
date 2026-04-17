require "rails_helper"

RSpec.describe "Days", type: :request do
  def login_as(user)
    post "/login_test", params: { user_id: user.id }
  end

  let(:author) { create(:user) }
  let(:tour)   { create(:tour, author: author) }

  it "POST /tours/:tour_id/days creates a day" do
    tour # force creation (triggers D1 seed callback) before asserting on Day.count
    login_as(author)
    expect {
      post tour_days_path(tour), params: { day: { day_index: 2, title: "抵达" } }
    }.to change(Day, :count).by(1)
    expect(response).to redirect_to(tour)
  end

  it "PATCH updates day" do
    day = create(:day, tour: tour, day_index: 2)
    login_as(author)
    patch tour_day_path(tour, day), params: { day: { buffer_day: true } }
    expect(day.reload.buffer_day).to be true
  end

  it "DELETE destroys day and nullifies its activities" do
    day = create(:day, tour: tour, day_index: 2)
    activity = create(:activity, tour: tour, day: day)
    login_as(author)
    delete tour_day_path(tour, day)
    expect(Day.exists?(day.id)).to be false
    expect(activity.reload.day_id).to be_nil
  end

  it "non-editor is forbidden" do
    other = create(:user)
    login_as(other)
    post tour_days_path(tour), params: { day: { day_index: 1 } }
    expect(response).to have_http_status(:forbidden)
  end

  describe "POST create with Accept: application/json" do
    it "returns id in JSON" do
      tour = create(:tour, author: author)
      login_as(author)
      post tour_days_path(tour),
        params: { day: { day_index: 2 } },
        headers: { "Accept" => "application/json" }
      expect(response).to have_http_status(:ok)
      body = JSON.parse(response.body)
      expect(body["id"]).to be_a(Integer)
    end
  end
end
