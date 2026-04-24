require "rails_helper"
require "rake"

RSpec.describe "route_leg_maintenance rake tasks", type: :task do
  before(:all) do
    Rails.application.load_tasks if Rake::Task.tasks.empty?
  end

  before do
    Rake::Task["route_leg_maintenance:refetch_zero_duration"].reenable
  end

  let(:tour) { create(:tour) }
  let(:day)  { tour.days.first }
  let(:a1) { create(:activity, tour: tour, day: day, lat: 43.83, lng: 87.62, position: 1) }
  let(:a2) { create(:activity, tour: tour, day: day, lat: 43.88, lng: 88.12, position: 2) }

  let(:fake_service) { instance_double(AmapDirectionService) }
  let(:fresh_result) do
    {
      distance_m: 101_673,
      duration_s: 7022,
      polyline: { "coords" => [ [ 87.62, 43.83 ], [ 88.12, 43.88 ] ] }
    }
  end

  before do
    allow(AmapDirectionService).to receive(:new).and_return(fake_service)
    allow(fake_service).to receive(:fetch).and_return(fresh_result)
  end

  def make_zero_dur_leg
    RouteLeg.create!(
      tour: tour, from_activity: a1, to_activity: a2, mode: :driving,
      distance_m: 101_673, duration_s: 0,  # the bug state
      endpoint_digest: "stale-digest",
      polyline: { "coords" => [] },
      fetched_at: 1.day.ago
    )
  end

  describe "route_leg_maintenance:refetch_zero_duration" do
    it "refetches legs with duration_s=0 and distance_m>0" do
      leg = make_zero_dur_leg
      Rake::Task["route_leg_maintenance:refetch_zero_duration"].invoke
      leg.reload
      expect(leg.duration_s).to eq(7022)
      expect(leg.distance_m).to eq(101_673)
      expect(fake_service).to have_received(:fetch).once
    end

    it "skips legs with distance_m=0 (likely coincident endpoints, not bug)" do
      leg = RouteLeg.create!(
        tour: tour, from_activity: a1, to_activity: a2, mode: :driving,
        distance_m: 0, duration_s: 0,
        endpoint_digest: "x", polyline: { "coords" => [] }
      )
      Rake::Task["route_leg_maintenance:refetch_zero_duration"].invoke
      leg.reload
      # Not touched
      expect(leg.duration_s).to eq(0)
      expect(fake_service).not_to have_received(:fetch)
    end

    it "skips legs that already have non-zero duration" do
      leg = RouteLeg.create!(
        tour: tour, from_activity: a1, to_activity: a2, mode: :driving,
        distance_m: 101_673, duration_s: 3600,
        endpoint_digest: "x", polyline: { "coords" => [] }
      )
      Rake::Task["route_leg_maintenance:refetch_zero_duration"].invoke
      leg.reload
      expect(leg.duration_s).to eq(3600)
      expect(fake_service).not_to have_received(:fetch)
    end

    it "is idempotent (second run finds 0 targets)" do
      make_zero_dur_leg
      Rake::Task["route_leg_maintenance:refetch_zero_duration"].invoke
      Rake::Task["route_leg_maintenance:refetch_zero_duration"].reenable
      Rake::Task["route_leg_maintenance:refetch_zero_duration"].invoke
      # Second invoke: no AMAP call because no matching legs (first run fixed them)
      expect(fake_service).to have_received(:fetch).once
    end

    it "DRY_RUN=1 produces report but changes nothing" do
      leg = make_zero_dur_leg
      ENV["DRY_RUN"] = "1"
      Rake::Task["route_leg_maintenance:refetch_zero_duration"].invoke
      leg.reload
      expect(leg.duration_s).to eq(0)
      expect(fake_service).not_to have_received(:fetch)
    ensure
      ENV.delete("DRY_RUN")
    end

    it "continues when a single leg fails" do
      good = make_zero_dur_leg
      bad_tour = create(:tour)
      bad_a1 = create(:activity, tour: bad_tour, lat: 0, lng: 0, position: 1)
      bad_a2 = create(:activity, tour: bad_tour, lat: 0, lng: 0, position: 2)
      bad_leg = RouteLeg.create!(
        tour: bad_tour, from_activity: bad_a1, to_activity: bad_a2, mode: :driving,
        distance_m: 100, duration_s: 0,
        endpoint_digest: "x", polyline: { "coords" => [] }
      )
      allow(fake_service).to receive(:fetch).and_raise(AmapDirectionService::Error, "boom")
                                             .and_return(fresh_result)
      expect {
        Rake::Task["route_leg_maintenance:refetch_zero_duration"].invoke
      }.not_to raise_error
    end
  end
end
