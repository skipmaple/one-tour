require "rails_helper"

RSpec.describe Day do
  it "requires day_index unique per tour" do
    tour = create(:tour)
    create(:day, tour: tour, day_index: 1)
    duplicate = build(:day, tour: tour, day_index: 1)
    expect(duplicate).not_to be_valid
  end

  it "allows same day_index across different tours" do
    create(:day, tour: create(:tour), day_index: 1)
    other = build(:day, tour: create(:tour), day_index: 1)
    expect(other).to be_valid
  end

  it "has intensity enum green/yellow/red" do
    expect(Day.intensities.keys).to eq(%w[green yellow red])
  end
end
