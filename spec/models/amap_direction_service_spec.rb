require "rails_helper"

RSpec.describe AmapDirectionService do
  let(:service) { described_class.new }

  let(:driving_body) do
    {
      status: "1",
      route: {
        paths: [
          {
            distance: "418000",
            duration: "22980",
            steps: [
              { polyline: "81.00,44.60;81.01,44.59;81.02,44.58" },
              { polyline: "81.02,44.58;82.00,43.50;82.10,43.30" }
            ]
          }
        ]
      }
    }.to_json
  end

  describe "#fetch driving" do
    before do
      stub_request(:get, /restapi\.amap\.com\/v5\/direction\/driving/)
        .to_return(status: 200, body: driving_body)
    end

    it "returns distance, duration, and concatenated polyline coords" do
      result = service.fetch(from_lat: 44.6, from_lng: 81.0, to_lat: 43.3, to_lng: 82.1, mode: :driving)
      expect(result[:distance_m]).to eq(418_000)
      expect(result[:duration_s]).to eq(22_980)
      # 5 unique coords (step 1 has 3, step 2 has 3 but first coord dedup overlap — we don't dedup, so 6 total)
      expect(result[:polyline]["coords"].size).to eq(6)
      expect(result[:polyline]["coords"].first).to eq([ 81.0, 44.6 ])
      expect(result[:polyline]["coords"].last).to eq([ 82.1, 43.3 ])
    end

    it "computes bounds from min/max lng/lat" do
      result = service.fetch(from_lat: 44.6, from_lng: 81.0, to_lat: 43.3, to_lng: 82.1, mode: :driving)
      expect(result[:polyline]["bounds"]["sw"]).to eq([ 81.0, 43.3 ])
      expect(result[:polyline]["bounds"]["ne"]).to eq([ 82.1, 44.6 ])
    end
  end

  describe "walking endpoint" do
    it "hits the walking URL for mode: :walking" do
      stub = stub_request(:get, /restapi\.amap\.com\/v5\/direction\/walking/)
               .to_return(status: 200, body: driving_body)
      service.fetch(from_lat: 44.6, from_lng: 81.0, to_lat: 43.3, to_lng: 82.1, mode: :walking)
      expect(stub).to have_been_requested
    end
  end

  describe "error handling" do
    it "raises Error when status != 1" do
      stub_request(:get, /restapi\.amap\.com/).to_return(
        status: 200, body: { status: "0", info: "INVALID_USER_KEY" }.to_json
      )
      expect {
        service.fetch(from_lat: 44.6, from_lng: 81.0, to_lat: 43.3, to_lng: 82.1)
      }.to raise_error(AmapDirectionService::Error, /INVALID_USER_KEY/)
    end

    it "raises Error when paths is empty" do
      stub_request(:get, /restapi\.amap\.com/).to_return(
        status: 200, body: { status: "1", route: { paths: [] } }.to_json
      )
      expect {
        service.fetch(from_lat: 44.6, from_lng: 81.0, to_lat: 43.3, to_lng: 82.1)
      }.to raise_error(AmapDirectionService::Error, /未找到可行路径/)
    end

    it "raises UnsupportedModeError for transit (not in MVP)" do
      expect {
        service.fetch(from_lat: 44.6, from_lng: 81.0, to_lat: 43.3, to_lng: 82.1, mode: :transit)
      }.to raise_error(AmapDirectionService::UnsupportedModeError)
    end
  end
end
