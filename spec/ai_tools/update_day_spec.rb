require "rails_helper"

RSpec.describe AITools::UpdateDay do
  let(:tour) { create(:tour) }

  it "updates title and buffer_day" do
    day = create(:day, tour: tour)
    result = described_class.new(tour: tour).execute(day_id: day.id, patch: { "title" => "新标题", "buffer_day" => true })
    expect(result[:ok]).to be true
    expect(day.reload.title).to eq("新标题")
    expect(day.buffer_day).to be true
  end

  it "ignores unknown fields" do
    day = create(:day, tour: tour)
    result = described_class.new(tour: tour).execute(day_id: day.id, patch: { "unknown" => "x", "title" => "ok" })
    expect(result[:ok]).to be true
    expect(result[:updated_fields]).not_to include("unknown")
    expect(result[:updated_fields]).to include("title")
  end

  it "returns error when day not found" do
    result = described_class.new(tour: tour).execute(day_id: 999_999, patch: { "title" => "x" })
    expect(result[:ok]).to be false
    expect(result[:error][:code]).to eq("day_not_found")
  end

  it "refuses to update a day that belongs to a different tour (BUG #6)" do
    other_tour = create(:tour)
    foreign    = create(:day, tour: other_tour)
    original   = foreign.title
    result = described_class.new(tour: tour).execute(day_id: foreign.id, patch: { "title" => "pwn" })
    expect(result[:ok]).to be false
    expect(result[:error][:code]).to eq("day_not_found")
    expect(foreign.reload.title).to eq(original)
  end
end
