require "rails_helper"

RSpec.describe AITools::AddActivity do
  let(:tour) { create(:tour) }

  it "creates activity in backlog when day_index is :backlog" do
    result = described_class.new.execute(
      tour_id: tour.id,
      day_index: "backlog",
      kind: "scenic",
      citizen_level: "tier_one",
      name: "赛里木湖",
      lat: 44.55,
      lng: 81.20,
      planned_duration_min: 240,
      details: { "best_light" => "傍晚" }
    )

    expect(result[:ok]).to be true
    activity = Activity.find(result[:activity_id])
    expect(activity.day_id).to be_nil
    expect(activity.name).to eq("赛里木湖")
    expect(activity.citizen_level).to eq("tier_one")
    expect(activity.details["best_light"]).to eq("傍晚")
  end

  it "creates activity in a specific day when day_index is a positive int" do
    day = create(:day, tour: tour, day_index: 2)
    result = described_class.new.execute(
      tour_id: tour.id,
      day_index: 2,
      kind: "food",
      citizen_level: "tier_three",
      name: "早餐店",
      details: {}
    )
    expect(result[:ok]).to be true
    expect(Activity.find(result[:activity_id]).day_id).to eq(day.id)
  end

  it "fails with ok:false when day_index not found" do
    result = described_class.new.execute(
      tour_id: tour.id,
      day_index: 99,
      kind: "scenic",
      citizen_level: "tier_three",
      name: "x"
    )
    expect(result[:ok]).to be false
    expect(result[:error][:code]).to eq("day_not_found")
  end
end
