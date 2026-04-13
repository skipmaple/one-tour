require "rails_helper"

RSpec.describe Geocoder do
  describe "#lookup with Amap" do
    let(:geocoder) { Geocoder.new(provider: :amap) }

    around do |example|
      ClimateControl.modify(AMAP_API_KEY: "test_amap_key") { example.run }
    end

    it "returns coordinates for a valid place name" do
      stub_request(:get, /restapi\.amap\.com\/v3\/geocode\/geo/)
        .with(query: hash_including("address" => "乌鲁木齐", "key" => "test_amap_key"))
        .to_return(
          status: 200,
          body: {
            status: "1",
            geocodes: [
              { location: "87.617,43.825", formatted_address: "新疆维吾尔自治区乌鲁木齐市" }
            ]
          }.to_json
        )

      result = geocoder.lookup("乌鲁木齐")

      expect(result.lat).to eq 43.825
      expect(result.lng).to eq 87.617
      expect(result.formatted_address).to eq "新疆维吾尔自治区乌鲁木齐市"
    end

    it "includes region_hint in query" do
      stub_request(:get, /restapi\.amap\.com\/v3\/geocode\/geo/)
        .with(query: hash_including("address" => "新疆赛里木湖"))
        .to_return(
          status: 200,
          body: {
            status: "1",
            geocodes: [
              { location: "81.0,44.6", formatted_address: "赛里木湖" }
            ]
          }.to_json
        )

      result = geocoder.lookup("赛里木湖", region_hint: "新疆")

      expect(result.lat).to eq 44.6
      expect(result.lng).to eq 81.0
    end

    it "raises error when geocoding fails" do
      stub_request(:get, /restapi\.amap\.com\/v3\/geocode\/geo/)
        .to_return(
          status: 200,
          body: { status: "0", info: "INVALID_USER_KEY" }.to_json
        )

      expect { geocoder.lookup("不存在的地方") }.to raise_error(Geocoder::Error, /Amap geocoding failed/)
    end
  end

  describe "#lookup with Google" do
    let(:geocoder) { Geocoder.new(provider: :google) }

    around do |example|
      ClimateControl.modify(GOOGLE_MAPS_API_KEY: "test_google_key") { example.run }
    end

    it "returns coordinates for a valid place name" do
      stub_request(:get, /maps\.googleapis\.com\/maps\/api\/geocode\/json/)
        .with(query: hash_including("address" => "Urumqi", "key" => "test_google_key"))
        .to_return(
          status: 200,
          body: {
            status: "OK",
            results: [
              {
                geometry: { location: { lat: 43.825, lng: 87.617 } },
                formatted_address: "Urumqi, Xinjiang, China"
              }
            ]
          }.to_json
        )

      result = geocoder.lookup("Urumqi")

      expect(result.lat).to eq 43.825
      expect(result.lng).to eq 87.617
      expect(result.formatted_address).to eq "Urumqi, Xinjiang, China"
    end

    it "raises error when geocoding fails" do
      stub_request(:get, /maps\.googleapis\.com\/maps\/api\/geocode\/json/)
        .to_return(
          status: 200,
          body: { status: "ZERO_RESULTS", results: [] }.to_json
        )

      expect { geocoder.lookup("不存在的地方") }.to raise_error(Geocoder::Error, /Google geocoding failed/)
    end
  end

  describe "provider selection" do
    it "defaults to amap when AMAP_API_KEY is set" do
      ClimateControl.modify(AMAP_API_KEY: "key") do
        stub_request(:get, /restapi\.amap\.com\/v3\/geocode\/geo/)
          .to_return(
            status: 200,
            body: { status: "1", geocodes: [{ location: "87.617,43.825", formatted_address: "乌鲁木齐" }] }.to_json
          )

        result = Geocoder.new.lookup("乌鲁木齐")
        expect(result.lat).to eq 43.825
      end
    end

    it "falls back to google when only GOOGLE_MAPS_API_KEY is set" do
      ClimateControl.modify(AMAP_API_KEY: nil, GOOGLE_MAPS_API_KEY: "key") do
        stub_request(:get, /maps\.googleapis\.com\/maps\/api\/geocode\/json/)
          .to_return(
            status: 200,
            body: { status: "OK", results: [{ geometry: { location: { lat: 43.825, lng: 87.617 } }, formatted_address: "Urumqi" }] }.to_json
          )

        result = Geocoder.new.lookup("Urumqi")
        expect(result.lat).to eq 43.825
      end
    end

    it "raises error when no API key is configured" do
      ClimateControl.modify(AMAP_API_KEY: nil, GOOGLE_MAPS_API_KEY: nil) do
        expect { Geocoder.new }.to raise_error(Geocoder::Error, /No geocoding API key/)
      end
    end
  end
end
