require "rails_helper"

RSpec.describe GeocodeTool do
  let(:tool) { GeocodeTool.new }

  describe "#execute" do
    it "returns coordinates for a valid place name" do
      geocoder_result = Geocoder::Result.new(lat: 43.825, lng: 87.617, formatted_address: "乌鲁木齐市")
      geocoder = instance_double(Geocoder, lookup: geocoder_result)
      allow(Geocoder).to receive(:new).and_return(geocoder)

      result = tool.execute(place_name: "乌鲁木齐")

      expect(result).to eq({ lat: 43.825, lng: 87.617, formatted_address: "乌鲁木齐市" })
    end

    it "passes region_hint to geocoder" do
      geocoder_result = Geocoder::Result.new(lat: 44.6, lng: 81.0, formatted_address: "赛里木湖")
      geocoder = instance_double(Geocoder)
      allow(Geocoder).to receive(:new).and_return(geocoder)
      allow(geocoder).to receive(:lookup).with("赛里木湖", region_hint: "新疆").and_return(geocoder_result)

      result = tool.execute(place_name: "赛里木湖", region_hint: "新疆")

      expect(result[:lat]).to eq 44.6
      expect(geocoder).to have_received(:lookup).with("赛里木湖", region_hint: "新疆")
    end

    it "returns error hash when geocoding fails" do
      geocoder = instance_double(Geocoder)
      allow(Geocoder).to receive(:new).and_return(geocoder)
      allow(geocoder).to receive(:lookup).and_raise(Geocoder::Error, "Amap geocoding failed")

      result = tool.execute(place_name: "不存在的地方")

      expect(result).to eq({ error: "Amap geocoding failed" })
    end
  end
end
