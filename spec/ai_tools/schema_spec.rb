require "rails_helper"

RSpec.describe AITools::Schema do
  it "returns a string listing all 12 tools" do
    text = described_class.to_prompt_description
    %w[AddActivity MoveActivity UpdateActivity DeleteActivity ReorderDay CreateDay UpdateDay DeleteDay RunConstitutionCheck AcknowledgeViolation UpdateConstitution SearchPoi].each do |tool|
      expect(text).to include(tool), "expected prompt description to mention #{tool}"
    end
  end

  it "#all returns all tool classes" do
    expect(described_class.all.size).to eq(12)
    expect(described_class.all).to all(be < AITools::Base)
  end
end
