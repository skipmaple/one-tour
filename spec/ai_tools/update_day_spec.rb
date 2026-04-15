require "rails_helper"

RSpec.describe AITools::UpdateDay do
  it "updates title and buffer_day" do
    day = create(:day)
    result = described_class.new.execute(day_id: day.id, patch: { "title" => "新标题", "buffer_day" => true })
    expect(result[:ok]).to be true
    expect(day.reload.title).to eq("新标题")
    expect(day.buffer_day).to be true
  end

  it "ignores unknown fields" do
    day = create(:day)
    result = described_class.new.execute(day_id: day.id, patch: { "unknown" => "x", "title" => "ok" })
    expect(result[:ok]).to be true
    expect(result[:updated_fields]).not_to include("unknown")
    expect(result[:updated_fields]).to include("title")
  end

  it "returns error when day not found" do
    result = described_class.new.execute(day_id: 999_999, patch: { "title" => "x" })
    expect(result[:ok]).to be false
    expect(result[:error][:code]).to eq("day_not_found")
  end
end
