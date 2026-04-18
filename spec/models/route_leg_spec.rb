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
end
