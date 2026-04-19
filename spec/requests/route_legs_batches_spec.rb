require "rails_helper"

RSpec.describe "RouteLegsBatches", type: :request do
  def login_as(user)
    post "/login_test", params: { user_id: user.id }
  end

  let(:author) { create(:user) }
  let(:tour)   { create(:tour, author: author) }
  let(:day)    { tour.days.first }
  let(:day2)   { create(:day, tour: tour, day_index: day.day_index + 1) }
  let(:a1) { create(:activity, tour: tour, day: day,  lat: 44.6, lng: 81.0, position: 1) }
  let(:a2) { create(:activity, tour: tour, day: day,  lat: 43.3, lng: 82.1, position: 2) }
  let(:a3) { create(:activity, tour: tour, day: day2, lat: 42.0, lng: 83.5, position: 1) }

  let(:amap_body) do
    {
      status: "1",
      route: {
        paths: [
          {
            distance: "100000", duration: "6000",
            steps: [ { polyline: "81.00,44.60;82.10,43.30" } ]
          }
        ]
      }
    }.to_json
  end

  describe "POST /tours/:tour_id/route_legs_batch" do
    before do
      stub_request(:get, /restapi\.amap\.com\/v5\/direction\/driving/)
        .to_return(status: 200, body: amap_body)
      # Force lazy lets to materialize so the pair count is predictable.
      a1; a2; a3
    end

    it "computes legs for all adjacent pairs (same-day + cross-day)" do
      login_as(author)
      expect {
        post tour_route_legs_batch_path(tour)
      }.to change(RouteLeg, :count).by(2)  # (a1→a2) same-day, (a2→a3) cross-day

      body = JSON.parse(response.body)
      expect(body["total"]).to eq(2)
      expect(body["computed"]).to eq(2)
      expect(body["cached"]).to eq(0)
      expect(body["failed"]).to eq(0)
    end

    # Critical — without this, repeat-clicks would blast the Amap quota.
    # `cache_valid?` inside Upsert short-circuits, and the controller uses
    # a pre-read to classify it as `:cached` in the summary.
    it "is idempotent — second call doesn't re-query Amap" do
      login_as(author)
      post tour_route_legs_batch_path(tour)  # first: 2 amap calls
      post tour_route_legs_batch_path(tour)  # second: all cached

      expect(RouteLeg.count).to eq(2)
      expect(WebMock).to have_requested(:get, /restapi\.amap\.com/).twice

      body = JSON.parse(response.body)
      expect(body["computed"]).to eq(0)
      expect(body["cached"]).to eq(2)
    end

    it "reports partial failure when one pair's Amap call errors" do
      login_as(author)
      # First pair succeeds, second returns Amap error
      stub_request(:get, /restapi\.amap\.com/)
        .to_return(status: 200, body: amap_body)
        .then.to_return(status: 200, body: { status: "0", info: "QUOTA_EXCEEDED" }.to_json)

      post tour_route_legs_batch_path(tour)
      body = JSON.parse(response.body)

      expect(body["total"]).to eq(2)
      expect(body["computed"]).to eq(1)
      expect(body["failed"]).to eq(1)
      expect(body["errors"].first).to match(/QUOTA_EXCEEDED/)
      expect(RouteLeg.count).to eq(1)  # the one that succeeded persisted
    end

    it "returns empty summary when no day-assigned activities" do
      RouteLeg.delete_all
      Activity.where(tour: tour).update_all(day_id: nil)

      login_as(author)
      post tour_route_legs_batch_path(tour)
      body = JSON.parse(response.body)
      expect(body["total"]).to eq(0)
    end

    it "skips activities without coords" do
      a1.update!(lat: nil, lng: nil)
      login_as(author)
      post tour_route_legs_batch_path(tour)
      body = JSON.parse(response.body)
      # a1 dropped → only (a2→a3) remains
      expect(body["total"]).to eq(1)
    end

    it "non-editor is forbidden" do
      login_as(create(:user))
      post tour_route_legs_batch_path(tour)
      expect(response).to have_http_status(:forbidden)
    end

    context "when called by Inertia (X-Inertia header set)" do
      it "redirects to tour_path with a summary notice" do
        login_as(author)
        post tour_route_legs_batch_path(tour), headers: { "X-Inertia" => "true" }
        expect(response).to redirect_to(tour_path(tour))
        expect(flash[:notice]).to match(/算了 2 段/)
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

      it "returns 429 after exceeding 10 batches per minute" do
        login_as(author)
        freeze_time do
          10.times { post tour_route_legs_batch_path(tour) }
          post tour_route_legs_batch_path(tour)
          expect(response).to have_http_status(:too_many_requests)
        end
      end
    end
  end
end
