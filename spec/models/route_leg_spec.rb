require "rails_helper"

RSpec.describe RouteLeg do
  let(:tour) { create(:tour) }
  let(:day)  { tour.days.first }
  let(:from_act) { create(:activity, tour: tour, day: day, lat: 44.6, lng: 81.0) }
  let(:to_act)   { create(:activity, tour: tour, day: day, lat: 43.3, lng: 82.1, position: 2) }

  def build_leg(**overrides)
    RouteLeg.new({
      tour: tour, from_activity: from_act, to_activity: to_act, mode: :driving
    }.merge(overrides))
  end

  describe "validations" do
    it "is valid with matching tour + coords" do
      expect(build_leg).to be_valid
    end

    it "rejects cross-tour from_activity" do
      other = create(:tour)
      foreign = create(:activity, tour: other, day: other.days.first, lat: 40, lng: 80)
      expect(build_leg(from_activity: foreign)).not_to be_valid
    end

    it "rejects missing coords" do
      no_coords = create(:activity, tour: tour, day: day, lat: nil, lng: nil, position: 3)
      leg = build_leg(to_activity: no_coords)
      expect(leg).not_to be_valid
      expect(leg.errors[:to_activity].first).to match(/坐标/)
    end
  end

  describe ".compute_endpoint_digest" do
    it "rounds coords to 4 decimals before hashing" do
      a = described_class.compute_endpoint_digest(from_lat: 44.61535, from_lng: 81.00001, to_lat: 43.3, to_lng: 82.1, mode: :driving)
      b = described_class.compute_endpoint_digest(from_lat: 44.6154, from_lng: 81.0000, to_lat: 43.3, to_lng: 82.1, mode: :driving)
      expect(a).to eq(b)
    end

    it "differs by mode" do
      drive = described_class.compute_endpoint_digest(from_lat: 44.6, from_lng: 81, to_lat: 43, to_lng: 82, mode: :driving)
      walk  = described_class.compute_endpoint_digest(from_lat: 44.6, from_lng: 81, to_lat: 43, to_lng: 82, mode: :walking)
      expect(drive).not_to eq(walk)
    end
  end

  describe "#cache_valid?" do
    it "returns true when polyline present and cache_key matches current endpoints" do
      leg = build_leg(polyline: { "coords" => [ [ 81, 44.6 ], [ 82.1, 43.3 ] ] })
      leg.endpoint_digest = leg.expected_endpoint_digest
      leg.save!
      expect(leg.cache_valid?).to be true
    end

    it "returns false when endpoint coords have moved since fetch" do
      leg = build_leg(polyline: { "coords" => [ [ 81, 44.6 ], [ 82.1, 43.3 ] ] })
      leg.endpoint_digest = leg.expected_endpoint_digest
      leg.save!
      # Simulate user moving the activity's POI to new coords.
      from_act.update!(lat: 45.0, lng: 80.0)
      expect(leg.reload.cache_valid?).to be false
    end

    it "returns false when polyline is empty (never fetched)" do
      leg = build_leg
      leg.endpoint_digest = leg.expected_endpoint_digest
      leg.save!
      expect(leg.cache_valid?).to be false
    end
  end

  describe "DB unique index" do
    it "forbids duplicate (tour, from, to, mode)" do
      RouteLeg.create!(tour: tour, from_activity: from_act, to_activity: to_act, mode: :driving)
      dup = RouteLeg.new(tour: tour, from_activity: from_act, to_activity: to_act, mode: :driving)
      expect { dup.save(validate: false) }.to raise_error(ActiveRecord::RecordNotUnique)
    end

    it "allows different modes for the same pair" do
      RouteLeg.create!(tour: tour, from_activity: from_act, to_activity: to_act, mode: :driving)
      walk = RouteLeg.new(tour: tour, from_activity: from_act, to_activity: to_act, mode: :walking)
      expect(walk).to be_valid
    end
  end

  describe "override" do
    let(:tour) { create(:tour) }
    let(:from_act) { create(:activity, tour: tour, lat: 36.0, lng: 103.0) }
    let(:to_act)   { create(:activity, tour: tour, lat: 37.0, lng: 104.0, position: 2) }
    let(:leg) do
      RouteLeg.create!(tour: tour, from_activity: from_act, to_activity: to_act,
                       mode: :driving, distance_m: 100_000, duration_s: 3600,
                       polyline: { "coords" => [] })
    end

    it "#overridden? is false when overridden_at is nil" do
      expect(leg.overridden?).to be false
    end

    it "#overridden? is true when overridden_at is set" do
      leg.update!(overridden_at: Time.current)
      expect(leg.overridden?).to be true
    end

    it "#effective_distance_m returns override when present" do
      leg.update!(distance_m_override: 120_000, overridden_at: Time.current)
      expect(leg.effective_distance_m).to eq(120_000)
    end

    it "#effective_distance_m falls back to distance_m when override nil" do
      expect(leg.effective_distance_m).to eq(100_000)
    end

    it "#effective_duration_s returns override when present" do
      leg.update!(duration_s_override: 4000, overridden_at: Time.current)
      expect(leg.effective_duration_s).to eq(4000)
    end

    it "#effective_duration_s falls back to duration_s when override nil" do
      expect(leg.effective_duration_s).to eq(3600)
    end
  end

  describe "#overridden_by association" do
    it "belongs_to overridden_by (class User), optional" do
      user = create(:user)
      tour = create(:tour, author: user)
      from_act = create(:activity, tour: tour, lat: 36.0, lng: 103.0)
      to_act   = create(:activity, tour: tour, lat: 37.0, lng: 104.0, position: 2)
      leg = RouteLeg.create!(tour: tour, from_activity: from_act, to_activity: to_act,
                             mode: :driving, distance_m: 100_000, duration_s: 3600,
                             polyline: { "coords" => [] })
      expect(leg.overridden_by).to be_nil

      leg.update!(overridden_by: user, overridden_at: Time.current)
      expect(leg.overridden_by).to eq(user)
    end
  end

  describe "endpoint digest with scenic road" do
    let(:tour) { create(:tour) }
    let(:prev) { create(:activity, tour: tour, lat: 36.0, lng: 103.0, position: 1) }
    let(:scenic) { create(:activity, :scenic_road, tour: tour, position: 2) }

    it "uses scenic road's details.start as TO endpoint digest input" do
      # When scenic is TO, use its start_lat/start_lng (entering the scenic road)
      digest_args = RouteLeg.resolve_endpoint_coords(from_activity: prev, to_activity: scenic)
      expect(digest_args[:from_lat].to_f).to eq(36.0)
      expect(digest_args[:from_lng].to_f).to eq(103.0)
      expect(digest_args[:to_lat].to_f).to eq(42.9)
      expect(digest_args[:to_lng].to_f).to eq(83.5)
    end

    it "uses scenic road's details.end as FROM endpoint digest input" do
      # When scenic is FROM, use its end_lat/end_lng (leaving the scenic road)
      next_act = create(:activity, tour: tour, lat: 45.0, lng: 85.0, position: 3)
      digest_args = RouteLeg.resolve_endpoint_coords(from_activity: scenic, to_activity: next_act)
      expect(digest_args[:from_lat].to_f).to eq(44.0)
      expect(digest_args[:from_lng].to_f).to eq(84.7)
      expect(digest_args[:to_lat].to_f).to eq(45.0)
      expect(digest_args[:to_lng].to_f).to eq(85.0)
    end

    # Regression: 缺 end 坐标的景观公路（用户只填了起点），不应让 Upsert 拿到
    # nil → to_f → 0.0 调 AMAP (0,0)。fallback 到 activity.lat/lng（before_save
    # 镜像了 start，永远非空）。
    it "falls back to activity.lat/lng when scenic road's end coords missing" do
      partial = create(:activity, tour: tour, kind: :road, citizen_level: :tier_one,
                       position: 4,
                       details: { "start_lat" => 42.9, "start_lng" => 83.5 })
      # No end_lat/end_lng in details. activity.lat/lng = mirrored start (42.9, 83.5).
      next_act = create(:activity, tour: tour, lat: 45.0, lng: 85.0, position: 5)
      digest_args = RouteLeg.resolve_endpoint_coords(from_activity: partial, to_activity: next_act)
      # Falls back to lat/lng (start mirror), not nil
      expect(digest_args[:from_lat].to_f).to eq(42.9)
      expect(digest_args[:from_lng].to_f).to eq(83.5)
      expect(digest_args[:from_lat]).not_to be_nil
      expect(digest_args[:from_lng]).not_to be_nil
    end
  end
end
