require "rails_helper"

RSpec.describe AITools::SearchPoi do
  it "delegates to PoiSearch and returns candidates" do
    fake_poi = [ { name: "赛里木湖", lat: 44.55, lng: 81.20, address: "博州" } ]
    allow_any_instance_of(PoiSearch).to receive(:search)
      .with("赛里木湖", region_hint: "伊犁", near_lat: nil, near_lng: nil)
      .and_return(fake_poi)

    result = described_class.new.execute(query: "赛里木湖", region_hint: "伊犁")
    expect(result[:ok]).to be true
    expect(result[:candidates]).to eq(fake_poi)
  end

  it "returns error hash when PoiSearch raises" do
    allow_any_instance_of(PoiSearch).to receive(:search).and_raise(PoiSearch::Error, "INVALID_PARAMS")
    result = described_class.new.execute(query: "x")
    expect(result[:ok]).to be false
    expect(result[:error][:code]).to eq("poi_search_failed")
  end
end
