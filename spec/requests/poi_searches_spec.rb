require "rails_helper"

RSpec.describe "POI Search", type: :request do
  def login_as(user)
    post "/login_test", params: { user_id: user.id }
  end

  let(:user) { create(:user) }

  let(:amap_success_body) do
    {
      status: "1",
      pois: [
        { name: "赛里木湖", location: "81.0,44.6", address: "博州", type: "风景名胜" }
      ]
    }.to_json
  end

  before do
    stub_request(:get, /restapi\.amap\.com/).to_return(status: 200, body: amap_success_body)
  end

  describe "GET /poi_search" do
    it "returns candidates for a valid query" do
      login_as(user)
      get "/poi_search", params: { q: "赛里木湖" }
      expect(response).to have_http_status(:ok)
      body = JSON.parse(response.body)
      expect(body["candidates"].size).to eq(1)
      expect(body["candidates"].first["name"]).to eq("赛里木湖")
      expect(body["candidates"].first["lat"]).to eq(44.6)
      expect(body["candidates"].first["lng"]).to eq(81.0)
    end

    it "requires login" do
      get "/poi_search", params: { q: "test" }
      expect(response).to redirect_to("/login")
    end

    it "returns 400 when q is missing" do
      login_as(user)
      get "/poi_search"
      expect(response).to have_http_status(:bad_request)
    end

    it "returns 400 when q is too long" do
      login_as(user)
      get "/poi_search", params: { q: "a" * 81 }
      expect(response).to have_http_status(:bad_request)
    end

    it "returns 502 when AMAP errors" do
      stub_request(:get, /restapi\.amap\.com/).to_return(
        status: 200, body: { status: "0", info: "INVALID_USER_KEY" }.to_json
      )
      login_as(user)
      get "/poi_search", params: { q: "test" }
      expect(response).to have_http_status(:bad_gateway)
      expect(JSON.parse(response.body)["error"]).to include("INVALID_USER_KEY")
    end

    context "throttle" do
      around do |example|
        original = Rails.cache
        Rails.cache = ActiveSupport::Cache::MemoryStore.new
        example.run
      ensure
        Rails.cache = original
      end

      it "returns 429 after exceeding 60 requests per minute" do
        login_as(user)
        freeze_time do
          60.times { get "/poi_search", params: { q: "ok" } }
          get "/poi_search", params: { q: "one more" }
          expect(response).to have_http_status(:too_many_requests)
        end
      end
    end
  end
end
