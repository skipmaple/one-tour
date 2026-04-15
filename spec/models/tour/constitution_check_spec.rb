require "rails_helper"

RSpec.describe Tour::ConstitutionCheck do
  it "returns empty array for a fresh tour with no days" do
    tour = create(:tour)
    expect(described_class.for(tour)).to eq([])
  end
end
