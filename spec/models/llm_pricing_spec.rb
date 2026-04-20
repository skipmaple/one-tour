require "rails_helper"

RSpec.describe LlmPricing do
  describe ".lookup" do
    it "returns known-model pricing by exact name" do
      result = described_class.lookup("moonshotai/Kimi-K2-Instruct-0905")
      expect(result["input_cents_per_mtok"]).to eq(400)
      expect(result["output_cents_per_mtok"]).to eq(1200)
    end

    it "falls back to _default for unknown models and warns" do
      expect(Rails.logger).to receive(:warn).with(/unknown model/)
      result = described_class.lookup("nonexistent-model-xyz")
      expect(result["input_cents_per_mtok"]).to eq(500)
      expect(result["output_cents_per_mtok"]).to eq(1500)
    end

    it "returns a hash with string keys (from YAML.load_file)" do
      result = described_class.lookup("_default")
      expect(result).to include("input_cents_per_mtok", "output_cents_per_mtok")
    end
  end
end
