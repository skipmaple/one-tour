require "rails_helper"

RSpec.describe "AmapDirections", type: :request do
  let(:user) { create(:user) }

  before { post "/login_test", params: { user_id: user.id } }

  it "returns distance + duration from AmapDirectionService" do
    svc = instance_double(AmapDirectionService)
    allow(AmapDirectionService).to receive(:new).and_return(svc)
    allow(svc).to receive(:fetch).and_return(
      distance_m: 120_000, duration_s: 9000, polyline: { "coords" => [] }
    )

    get "/amap_direction", params: {
      from_lat: 42.9, from_lng: 83.5, to_lat: 44.0, to_lng: 84.7
    }
    expect(response).to have_http_status(:ok)
    expect(JSON.parse(response.body)).to include("distance_m" => 120_000, "duration_s" => 9000)
  end

  it "returns 422 when any coord is missing / blank" do
    get "/amap_direction", params: { from_lat: "43.83", from_lng: "" }
    expect(response).to have_http_status(:unprocessable_entity)
    expect(JSON.parse(response.body)["error"]).to include("坐标")
  end

  it "returns 422 when any coord is non-numeric" do
    get "/amap_direction", params: {
      from_lat: "abc", from_lng: "87.62", to_lat: "44.0", to_lng: "88.0"
    }
    expect(response).to have_http_status(:unprocessable_entity)
  end

  it "does not call AmapDirectionService when coords are invalid" do
    expect(AmapDirectionService).not_to receive(:new)
    get "/amap_direction", params: { from_lat: "43.83" }
    expect(response).to have_http_status(:unprocessable_entity)
  end
end
