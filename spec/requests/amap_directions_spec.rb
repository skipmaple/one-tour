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
end
