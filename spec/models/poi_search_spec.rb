require "rails_helper"

RSpec.describe PoiSearch do
  let(:api_key) { "test-amap-key" }

  before { stub_const("ENV", ENV.to_hash.merge("AMAP_API_KEY" => api_key)) }

  describe "#search" do
    it "returns a list of POI candidates from AMAP v5/place/text" do
      stub_request(:get, "https://restapi.amap.com/v5/place/text")
        .with(query: hash_including(
          "keywords" => "赛里木湖",
          "key" => api_key,
          "output" => "JSON"
        ))
        .to_return(
          status: 200,
          body: {
            status: "1",
            pois: [
              {
                name: "赛里木湖", location: "81.20,44.55", address: "博州", type: "风景名胜",
                pname: "新疆维吾尔自治区", cityname: "博尔塔拉蒙古自治州",
                adname: "博乐市", pcode: "650000"
              }
            ]
          }.to_json,
          headers: { "Content-Type" => "application/json" }
        )

      results = described_class.new.search("赛里木湖")
      expect(results).to be_an(Array)
      expect(results.first[:name]).to eq("赛里木湖")
      expect(results.first[:lat]).to eq(44.55)
      expect(results.first[:lng]).to eq(81.20)
      expect(results.first[:address]).to eq("博州")
      expect(results.first[:pname]).to eq("新疆维吾尔自治区")
      expect(results.first[:cityname]).to eq("博尔塔拉蒙古自治州")
      expect(results.first[:adname]).to eq("博乐市")
      expect(results.first[:pcode]).to eq("650000")
    end

    it "supports region_hint to narrow search" do
      stub_request(:get, "https://restapi.amap.com/v5/place/text")
        .with(query: hash_including("region" => "伊犁"))
        .to_return(
          status: 200,
          body: { status: "1", pois: [] }.to_json,
          headers: { "Content-Type" => "application/json" }
        )
      described_class.new.search("某地", region_hint: "伊犁")
    end

    it "raises PoiSearch::Error on AMAP error status" do
      stub_request(:get, /restapi\.amap\.com\/v5\/place\/text/)
        .to_return(status: 200, body: { status: "0", info: "INVALID_PARAMS" }.to_json)
      expect {
        described_class.new.search("bad")
      }.to raise_error(PoiSearch::Error, /INVALID_PARAMS/)
    end
  end
end
