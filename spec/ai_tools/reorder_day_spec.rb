require "rails_helper"

RSpec.describe AITools::ReorderDay do
  it "assigns position by given order" do
    tour = create(:tour)
    day = create(:day, tour: tour)
    a = create(:activity, tour: tour, day: day, position: 1)
    b = create(:activity, tour: tour, day: day, position: 2)
    c = create(:activity, tour: tour, day: day, position: 3)
    described_class.new.execute(day_id: day.id, activity_ids: [ c.id, a.id, b.id ])
    expect(c.reload.position).to eq(1)
    expect(a.reload.position).to eq(2)
    expect(b.reload.position).to eq(3)
  end

  it "skips unknown activity_ids silently" do
    tour = create(:tour)
    day = create(:day, tour: tour)
    a = create(:activity, tour: tour, day: day, position: 5)
    result = described_class.new.execute(day_id: day.id, activity_ids: [ 999, a.id ])
    expect(result[:ok]).to be true
    expect(a.reload.position).to eq(2)
  end

  it "returns error when day not found" do
    result = described_class.new.execute(day_id: 9_999, activity_ids: [])
    expect(result[:ok]).to be false
    expect(result[:error][:code]).to eq("day_not_found")
  end
end
