require "rails_helper"

RSpec.describe ActivityPlaceEnricher do
  let(:api_key) { "test-amap-key" }
  before { stub_const("ENV", ENV.to_hash.merge("AMAP_API_KEY" => api_key)) }
  let(:tour) { create(:tour) }

  def stub_amap(pois)
    stub_request(:get, /restapi\.amap\.com\/v5\/place\/text/)
      .to_return(
        status: 200,
        body: { status: "1", pois: pois }.to_json,
        headers: { "Content-Type" => "application/json" }
      )
  end

  it "enriches an activity with the nearest matching POI's place metadata" do
    a = create(:activity, tour: tour, name: "赛里木湖", lat: 44.55, lng: 81.20, details: {})
    stub_amap([
      { name: "赛里木湖", location: "81.201,44.551", typecode: "110202",
        business: { rating: "4.9", keytag: "5A景区" }, photos: [ { url: "https://x/p.jpg" } ] }
    ])
    expect(described_class.new.enrich!(a)).to eq(:enriched)
    expect(a.reload.details["place"]).to include(
      "rating" => "4.9", "keytag" => "5A景区", "photo" => "https://x/p.jpg"
    )
  end

  it "skips when the nearest candidate is beyond the match radius" do
    a = create(:activity, tour: tour, name: "某地", lat: 44.0, lng: 81.0, details: {})
    stub_amap([ { name: "远地方", location: "100.0,30.0", business: { rating: "4.0", keytag: "x" } } ])
    expect(described_class.new.enrich!(a)).to eq(:no_match)
    expect(a.reload.details["place"]).to be_nil
  end

  it "skips activities without coordinates (makes no AMAP call)" do
    a = create(:activity, tour: tour, name: "无坐标", lat: nil, lng: nil)
    expect(described_class.new.enrich!(a)).to eq(:skipped_no_coords)
  end

  it "skips activities that already carry place metadata (idempotent)" do
    a = create(:activity, tour: tour, name: "已有", lat: 44.0, lng: 81.0, details: { "place" => { "rating" => "4.0" } })
    expect(described_class.new.enrich!(a)).to eq(:skipped_has_place)
  end

  it "does not enrich road/地名 POIs that lack rating/keytag/photo" do
    a = create(:activity, tour: tour, name: "独库公路", lat: 43.0, lng: 84.0, details: {})
    stub_amap([ { name: "独库公路", location: "84.001,43.001", typecode: "190301", business: {}, photos: [] } ])
    expect(described_class.new.enrich!(a)).to eq(:no_match)
    expect(a.reload.details["place"]).to be_nil
  end
end
