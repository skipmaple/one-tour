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
end
