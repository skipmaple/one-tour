require "rails_helper"

RSpec.describe "RouteLegs", type: :request do
  def login_as(user)
    post "/login_test", params: { user_id: user.id }
  end

  let(:author) { create(:user) }
  let(:tour)   { create(:tour, author: author) }
  let(:day)    { tour.days.first }
  let(:from_act) { create(:activity, tour: tour, day: day, lat: 44.6, lng: 81.0) }
  let(:to_act)   { create(:activity, tour: tour, day: day, lat: 43.3, lng: 82.1, position: 2) }

  let(:amap_body) do
    {
      status: "1",
      route: {
        paths: [
          {
            distance: "418000", duration: "22980",
            steps: [ { polyline: "81.00,44.60;81.50,44.00;82.10,43.30" } ]
          }
        ]
      }
    }.to_json
  end

  describe "POST /tours/:tour_id/route_legs" do
    before do
      stub_request(:get, /restapi\.amap\.com\/v5\/direction\/driving/)
        .to_return(status: 200, body: amap_body)
    end

    it "creates a route leg and populates from Amap" do
      login_as(author)
      expect {
        post tour_route_legs_path(tour), params: {
          from_activity_id: from_act.id, to_activity_id: to_act.id, mode: "driving"
        }
      }.to change(RouteLeg, :count).by(1)

      body = JSON.parse(response.body)
      expect(body["distance_m"]).to eq(418_000)
      expect(body["duration_s"]).to eq(22_980)
      expect(body["polyline"]["coords"].size).to eq(3)
    end

    it "is idempotent and doesn't call Amap on cache hit" do
      login_as(author)
      post tour_route_legs_path(tour), params: { from_activity_id: from_act.id, to_activity_id: to_act.id, mode: "driving" }
      post tour_route_legs_path(tour), params: { from_activity_id: from_act.id, to_activity_id: to_act.id, mode: "driving" }
      expect(RouteLeg.count).to eq(1)
      # 2 user calls, but only 1 actual Amap HTTP request
      expect(WebMock).to have_requested(:get, /restapi\.amap\.com\/v5\/direction\/driving/).once
    end

    it "refetches when endpoint coords have moved" do
      login_as(author)
      post tour_route_legs_path(tour), params: { from_activity_id: from_act.id, to_activity_id: to_act.id, mode: "driving" }
      to_act.update!(lat: 40.0, lng: 85.0)
      post tour_route_legs_path(tour), params: { from_activity_id: from_act.id, to_activity_id: to_act.id, mode: "driving" }
      expect(WebMock).to have_requested(:get, /restapi\.amap\.com\/v5\/direction\/driving/).twice
    end

    it "translates Amap errors into 502 with a user-safe message" do
      stub_request(:get, /restapi\.amap\.com/).to_return(
        status: 200, body: { status: "0", info: "QUOTA_EXCEEDED" }.to_json
      )
      login_as(author)
      post tour_route_legs_path(tour), params: { from_activity_id: from_act.id, to_activity_id: to_act.id, mode: "driving" }
      expect(response).to have_http_status(:bad_gateway)
      expect(JSON.parse(response.body)["errors"].first).to match(/地图路线服务/)
    end

    it "returns 422 for transit (not in MVP)" do
      login_as(author)
      post tour_route_legs_path(tour), params: { from_activity_id: from_act.id, to_activity_id: to_act.id, mode: "transit" }
      expect(response).to have_http_status(:unprocessable_entity)
    end

    it "non-editor is forbidden" do
      login_as(create(:user))
      post tour_route_legs_path(tour), params: { from_activity_id: from_act.id, to_activity_id: to_act.id, mode: "driving" }
      expect(response).to have_http_status(:forbidden)
    end

    # Inertia's router.post sends X-Inertia: true and expects a redirect (not
    # JSON). Before this fix, render json: triggered Inertia's "invalid response"
    # modal in the browser and the route_leg still got created but the UI
    # appeared stuck. Regression guard.
    context "when called by Inertia (X-Inertia header set)" do
      it "redirects to tour_path with 302 so Inertia partial-reload can fire" do
        login_as(author)
        post tour_route_legs_path(tour),
          params: { from_activity_id: from_act.id, to_activity_id: to_act.id, mode: "driving" },
          headers: { "X-Inertia" => "true" }
        expect(response).to redirect_to(tour_path(tour))
      end

      it "surfaces Amap errors via flash[:alert] instead of 502 JSON" do
        stub_request(:get, /restapi\.amap\.com/).to_return(
          status: 200, body: { status: "0", info: "QUOTA_EXCEEDED" }.to_json
        )
        login_as(author)
        post tour_route_legs_path(tour),
          params: { from_activity_id: from_act.id, to_activity_id: to_act.id, mode: "driving" },
          headers: { "X-Inertia" => "true" }
        expect(response).to redirect_to(tour_path(tour))
        expect(flash[:alert]).to match(/地图路线服务/)
      end
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
        login_as(author)
        60.times { post tour_route_legs_path(tour), params: { from_activity_id: from_act.id, to_activity_id: to_act.id } }
        post tour_route_legs_path(tour), params: { from_activity_id: from_act.id, to_activity_id: to_act.id }
        expect(response).to have_http_status(:too_many_requests)
      end
    end
  end

  describe "DELETE /route_legs/:id" do
    it "destroys the leg" do
      leg = RouteLeg.create!(
        tour: tour, from_activity: from_act, to_activity: to_act, mode: :driving,
        polyline: { "coords" => [] }
      )
      login_as(author)
      expect { delete route_leg_path(leg) }.to change(RouteLeg, :count).by(-1)
    end

    it "non-editor is forbidden" do
      leg = RouteLeg.create!(
        tour: tour, from_activity: from_act, to_activity: to_act, mode: :driving,
        polyline: { "coords" => [] }
      )
      login_as(create(:user))
      delete route_leg_path(leg)
      expect(response).to have_http_status(:forbidden)
    end
  end
end
