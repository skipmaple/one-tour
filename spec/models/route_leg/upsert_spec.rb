require "rails_helper"

RSpec.describe RouteLeg::Upsert do
  let(:tour) { create(:tour) }
  let(:day)  { tour.days.first }
  let(:from_act) { create(:activity, tour: tour, day: day, lat: 44.6, lng: 81.0) }
  let(:to_act)   { create(:activity, tour: tour, day: day, lat: 43.3, lng: 82.1, position: 2) }

  let(:fake_service) { instance_double(AmapDirectionService) }
  let(:fake_result) do
    {
      distance_m: 418_000,
      duration_s: 22_980,
      polyline:   { "coords" => [ [ 81.0, 44.6 ], [ 82.1, 43.3 ] ], "bounds" => {} }
    }
  end

  def call_upsert
    described_class.new(
      tour: tour, from_activity_id: from_act.id, to_activity_id: to_act.id,
      mode: :driving, service: fake_service
    ).call
  end

  describe "first call" do
    it "creates a RouteLeg and populates from Amap" do
      allow(fake_service).to receive(:fetch).and_return(fake_result)
      leg = call_upsert
      expect(leg).to be_persisted
      expect(leg.distance_m).to eq(418_000)
      expect(leg.duration_s).to eq(22_980)
      expect(leg.endpoint_digest).to eq(leg.expected_endpoint_digest)
      expect(leg.fetched_at).to be_present
    end
  end

  describe "cache hit" do
    it "does not call Amap when endpoints haven't changed" do
      allow(fake_service).to receive(:fetch).and_return(fake_result)
      first = call_upsert                          # 1 Amap call
      expect(fake_service).to have_received(:fetch).once

      second = call_upsert                         # cache hit → no call
      expect(fake_service).to have_received(:fetch).once
      expect(second.id).to eq(first.id)
      expect(second.fetched_at).to eq(first.fetched_at)
    end
  end

  describe "cache miss after move" do
    it "refetches when an endpoint's coords change" do
      allow(fake_service).to receive(:fetch).and_return(fake_result)
      call_upsert
      expect(fake_service).to have_received(:fetch).once

      # User moves the "to" activity to a new POI.
      to_act.update!(lat: 40.0, lng: 85.0)
      call_upsert
      expect(fake_service).to have_received(:fetch).twice
    end
  end

  describe "#cache_hit?" do
    it "is false on a fresh call that fetched from Amap" do
      allow(fake_service).to receive(:fetch).and_return(fake_result)
      upsert = described_class.new(tour: tour, from_activity_id: from_act.id, to_activity_id: to_act.id, mode: :driving, service: fake_service)
      upsert.call
      expect(upsert.cache_hit?).to be(false)
    end

    it "is true on a second call that short-circuited" do
      allow(fake_service).to receive(:fetch).and_return(fake_result)
      # Prime cache
      described_class.new(tour: tour, from_activity_id: from_act.id, to_activity_id: to_act.id, mode: :driving, service: fake_service).call

      upsert = described_class.new(tour: tour, from_activity_id: from_act.id, to_activity_id: to_act.id, mode: :driving, service: fake_service)
      upsert.call
      expect(upsert.cache_hit?).to be(true)
    end

    it "is nil before #call" do
      upsert = described_class.new(tour: tour, from_activity_id: from_act.id, to_activity_id: to_act.id, mode: :driving, service: fake_service)
      expect(upsert.cache_hit?).to be_nil
    end
  end

  describe "per-mode legs coexist" do
    it "creates separate rows for driving and walking" do
      allow(fake_service).to receive(:fetch).and_return(fake_result)
      drive = described_class.new(tour: tour, from_activity_id: from_act.id, to_activity_id: to_act.id, mode: :driving, service: fake_service).call
      walk  = described_class.new(tour: tour, from_activity_id: from_act.id, to_activity_id: to_act.id, mode: :walking, service: fake_service).call
      expect(drive.id).not_to eq(walk.id)
      expect(tour.route_legs.count).to eq(2)
    end
  end

  describe "override cleanup when coords change" do
    it "clears override on refetch after endpoint moves" do
      allow(fake_service).to receive(:fetch).and_return(fake_result)
      leg = call_upsert
      leg.update!(
        distance_m_override: 500_000, duration_s_override: 30_000,
        note: "绕行", overridden_at: Time.current
      )

      # User moves "to" coords → triggers refetch
      to_act.update!(lat: 40.0, lng: 85.0)
      call_upsert

      leg.reload
      expect(leg.distance_m_override).to be_nil
      expect(leg.duration_s_override).to be_nil
      expect(leg.note).to be_nil
      expect(leg.overridden_at).to be_nil
    end

    # Regression: cache_valid? is false for either coord change OR missing
    # polyline. Only the former implies override is stale — don't wipe it
    # when we're just refetching a corrupted/empty polyline.
    it "preserves override when endpoint_digest is nil (e.g. forced refetch via maintenance rake)" do
      allow(fake_service).to receive(:fetch).and_return(fake_result)
      leg = call_upsert
      leg.update!(
        distance_m_override: 500_000, duration_s_override: 30_000,
        note: "绕行", overridden_at: Time.current,
        endpoint_digest: nil  # simulate maintenance rake clearing digest to force refetch
      )

      call_upsert

      leg.reload
      expect(leg.distance_m_override).to eq(500_000)
      expect(leg.duration_s_override).to eq(30_000)
      expect(leg.note).to eq("绕行")
      expect(leg.overridden_at).to be_present
    end

    it "preserves override when refetching with unchanged coords (e.g. missing polyline)" do
      allow(fake_service).to receive(:fetch).and_return(fake_result)
      leg = call_upsert
      leg.update!(
        distance_m_override: 500_000, duration_s_override: 30_000,
        note: "绕行", overridden_at: Time.current
      )

      # Simulate cache miss WITHOUT coord change: empty the polyline so
      # cache_valid? returns false (polyline.present? is false for empty hash)
      # but endpoint_digest still matches.
      leg.update!(polyline: {})
      call_upsert

      leg.reload
      expect(leg.distance_m_override).to eq(500_000)
      expect(leg.duration_s_override).to eq(30_000)
      expect(leg.note).to eq("绕行")
      expect(leg.overridden_at).to be_present
    end
  end

  describe "scenic road endpoint resolution" do
    let(:scenic) { create(:activity, :scenic_road, tour: tour, position: 2) }
    let(:post_scenic) { create(:activity, tour: tour, lat: 45.0, lng: 85.0, position: 3) }

    it "calls Amap with scenic start coords when scenic is TO" do
      allow(fake_service).to receive(:fetch).and_return(fake_result)
      described_class.new(
        tour: tour, from_activity_id: from_act.id, to_activity_id: scenic.id,
        mode: :driving, service: fake_service
      ).call

      expect(fake_service).to have_received(:fetch).with(
        hash_including(to_lat: 42.9, to_lng: 83.5)
      )
    end

    it "calls Amap with scenic end coords when scenic is FROM" do
      allow(fake_service).to receive(:fetch).and_return(fake_result)
      described_class.new(
        tour: tour, from_activity_id: scenic.id, to_activity_id: post_scenic.id,
        mode: :driving, service: fake_service
      ).call

      expect(fake_service).to have_received(:fetch).with(
        hash_including(from_lat: 44.0, from_lng: 84.7)
      )
    end
  end
end
