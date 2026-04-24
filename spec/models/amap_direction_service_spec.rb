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

    # Regression: AMAP v5 driving 默认不返 path["duration"]，只在请求 show_fields=cost
    # 时给 path.cost.duration（秒）。下发时长为 0 的 bug 就是这里——parser 要能读 v5 shape。
    it "reads duration from path.cost.duration (AMAP v5 shape)" do
      v5_body = {
        status: "1",
        route: {
          paths: [
            {
              distance: "101673",
              # 注意：顶层没有 duration 字段
              cost: { duration: "7022", tolls: "0", traffic_lights: "12" },
              steps: [ { polyline: "87.62,43.83;88.12,43.88" } ]
            }
          ]
        }
      }.to_json
      stub_request(:get, /restapi\.amap\.com\/v5\/direction\/driving/)
        .to_return(status: 200, body: v5_body)

      result = service.fetch(from_lat: 43.83, from_lng: 87.62, to_lat: 43.88, to_lng: 88.12, mode: :driving)
      expect(result[:distance_m]).to eq(101_673)
      expect(result[:duration_s]).to eq(7022)
    end

    it "requests show_fields=polyline,cost in the URL" do
      stub = stub_request(:get, /restapi\.amap\.com\/v5\/direction\/driving/)
               .with(query: hash_including("show_fields" => "polyline,cost"))
               .to_return(status: 200, body: driving_body)
      service.fetch(from_lat: 44.6, from_lng: 81.0, to_lat: 43.3, to_lng: 82.1, mode: :driving)
      expect(stub).to have_been_requested
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

  # Amap free tier ~3 QPS; a batch of 20+ pairs at ~150ms each will trip it.
  # The service transparently retries on that specific error only. Any other
  # Amap error (INVALID_USER_KEY, quota, etc.) surfaces immediately.
  describe "retry on CUQPS_HAS_EXCEEDED_THE_LIMIT" do
    # Collect sleep durations instead of actually sleeping — keeps the spec fast
    # and lets us assert backoff shape.
    let(:sleeps) { [] }
    let(:service) { described_class.new(sleep_fn: ->(s) { sleeps << s }) }

    let(:rate_limited_body) { { status: "0", info: "CUQPS_HAS_EXCEEDED_THE_LIMIT" }.to_json }

    it "retries on CUQPS error and succeeds on second attempt" do
      stub_request(:get, /restapi\.amap\.com/)
        .to_return({ status: 200, body: rate_limited_body },
                   { status: 200, body: driving_body })

      result = service.fetch(from_lat: 44.6, from_lng: 81.0, to_lat: 43.3, to_lng: 82.1)
      expect(result[:distance_m]).to eq(418_000)
      expect(WebMock).to have_requested(:get, /restapi\.amap\.com/).twice
      expect(sleeps).to eq([ 0.5 ])  # attempt 1 waited 0.5s before retry
    end

    it "backs off linearly across multiple retries" do
      stub_request(:get, /restapi\.amap\.com/)
        .to_return({ status: 200, body: rate_limited_body },
                   { status: 200, body: rate_limited_body },
                   { status: 200, body: driving_body })

      service.fetch(from_lat: 44.6, from_lng: 81.0, to_lat: 43.3, to_lng: 82.1)
      expect(WebMock).to have_requested(:get, /restapi\.amap\.com/).times(3)
      expect(sleeps).to eq([ 0.5, 1.0 ])  # linear: attempt 1 × 0.5, attempt 2 × 1.0
    end

    it "gives up after max_retries and raises the rate-limit error" do
      stub_request(:get, /restapi\.amap\.com/)
        .to_return(status: 200, body: rate_limited_body)

      expect {
        service.fetch(from_lat: 44.6, from_lng: 81.0, to_lat: 43.3, to_lng: 82.1)
      }.to raise_error(AmapDirectionService::Error, /CUQPS_HAS_EXCEEDED_THE_LIMIT/)
      # 1 initial + 2 retries = 3 calls
      expect(WebMock).to have_requested(:get, /restapi\.amap\.com/).times(3)
      expect(sleeps).to eq([ 0.5, 1.0 ])
    end

    it "does NOT retry on other Amap errors (INVALID_USER_KEY etc.)" do
      stub_request(:get, /restapi\.amap\.com/)
        .to_return(status: 200, body: { status: "0", info: "INVALID_USER_KEY" }.to_json)

      expect {
        service.fetch(from_lat: 44.6, from_lng: 81.0, to_lat: 43.3, to_lng: 82.1)
      }.to raise_error(AmapDirectionService::Error, /INVALID_USER_KEY/)
      expect(WebMock).to have_requested(:get, /restapi\.amap\.com/).once
      expect(sleeps).to be_empty
    end
  end
end
