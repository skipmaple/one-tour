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

  describe "per-mode legs coexist" do
    it "creates separate rows for driving and walking" do
      allow(fake_service).to receive(:fetch).and_return(fake_result)
      drive = described_class.new(tour: tour, from_activity_id: from_act.id, to_activity_id: to_act.id, mode: :driving, service: fake_service).call
      walk  = described_class.new(tour: tour, from_activity_id: from_act.id, to_activity_id: to_act.id, mode: :walking, service: fake_service).call
      expect(drive.id).not_to eq(walk.id)
      expect(tour.route_legs.count).to eq(2)
    end
  end
end
