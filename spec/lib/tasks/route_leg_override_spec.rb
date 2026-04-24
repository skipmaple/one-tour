require "rails_helper"
require "rake"

RSpec.describe "route_leg_override rake tasks", type: :task do
  before(:all) do
    Rails.application.load_tasks if Rake::Task.tasks.empty?
  end

  let(:tour) { create(:tour) }
  let(:day)  { tour.days.first }

  describe "route_leg_override:migrate_low_tier_road" do
    let(:prev) { create(:activity, tour: tour, day: day, lat: 36.0, lng: 103.0, position: 1) }
    let(:road) do
      build(:activity, tour: tour, day: day, kind: :road, citizen_level: :tier_two,
            lat: 36.5, lng: 103.5, position: 2,
            details: { "km" => 120, "drive_min" => 150 })
    end
    let(:nxt)  { create(:activity, tour: tour, day: day, lat: 37.0, lng: 104.0, position: 3) }

    before do
      # tier_two road violates A.4 validation. Save bypass for test setup:
      prev
      road.save!(validate: false)  # bypass road_must_be_tier_one
      nxt
      # Stub AmapDirectionService so Upsert doesn't hit network
      allow_any_instance_of(AmapDirectionService).to receive(:fetch).and_return(
        distance_m: 110_000, duration_s: 7000, polyline: { "coords" => [] }
      )
    end

    it "creates leg prev→next with override from road's details" do
      Rake::Task["route_leg_override:migrate_low_tier_road"].invoke
      leg = RouteLeg.find_by(from_activity_id: prev.id, to_activity_id: nxt.id)
      expect(leg).to be_present
      expect(leg.distance_m_override).to eq(120_000)
      expect(leg.duration_s_override).to eq(150 * 60)
      expect(leg.note).to include(road.name)
      expect(leg.overridden_at).to be_present
    end

    it "does not delete the activity (deletion is separate task)" do
      Rake::Task["route_leg_override:migrate_low_tier_road"].reenable
      Rake::Task["route_leg_override:migrate_low_tier_road"].invoke
      expect(Activity.exists?(road.id)).to be true
    end

    it "DRY_RUN=1 produces report but creates no override" do
      ENV["DRY_RUN"] = "1"
      Rake::Task["route_leg_override:migrate_low_tier_road"].reenable
      Rake::Task["route_leg_override:migrate_low_tier_road"].invoke
      expect(RouteLeg.where(from_activity_id: prev.id).any? { |l| l.overridden? }).to be false
    ensure
      ENV.delete("DRY_RUN")
    end

    # Regression: 源 activity 没填 km/drive_min 时，不要 nil.to_f → 0 写
    # distance_m_override: 0（这会让 effective 返 0 覆盖 AMAP 原值）。
    it "does not write 0 override when source activity has no km/drive_min" do
      bare_prev = create(:activity, tour: tour, day: day, lat: 36.0, lng: 103.0, position: 10)
      bare_road = build(:activity, tour: tour, day: day, kind: :road, citizen_level: :tier_two,
                        lat: 36.5, lng: 103.5, position: 11,
                        name: "无数据 road", details: {})  # 没有 km/drive_min
      bare_road.save!(validate: false)
      bare_next = create(:activity, tour: tour, day: day, lat: 37.0, lng: 104.0, position: 12)

      Rake::Task["route_leg_override:migrate_low_tier_road"].reenable
      Rake::Task["route_leg_override:migrate_low_tier_road"].invoke

      leg = RouteLeg.find_by(from_activity_id: bare_prev.id, to_activity_id: bare_next.id)
      if leg  # leg 创建了，但 override 字段应保持 nil（note 会承载 road.name）
        expect(leg.distance_m_override).to be_nil
        expect(leg.duration_s_override).to be_nil
        # note 承载信息——overridden_at 设了合理（至少有 note）
        expect(leg.note).to include("无数据 road")
      end
    end

    it "only writes present fields (partial km, missing drive_min)" do
      partial_prev = create(:activity, tour: tour, day: day, lat: 36.0, lng: 103.0, position: 20)
      partial_road = build(:activity, tour: tour, day: day, kind: :road, citizen_level: :tier_two,
                           lat: 36.5, lng: 103.5, position: 21, name: "只有里程的 road",
                           details: { "km" => 80 })  # 没 drive_min
      partial_road.save!(validate: false)
      partial_next = create(:activity, tour: tour, day: day, lat: 37.0, lng: 104.0, position: 22)

      Rake::Task["route_leg_override:migrate_low_tier_road"].reenable
      Rake::Task["route_leg_override:migrate_low_tier_road"].invoke

      leg = RouteLeg.find_by(from_activity_id: partial_prev.id, to_activity_id: partial_next.id)
      expect(leg.distance_m_override).to eq(80_000)
      expect(leg.duration_s_override).to be_nil  # 源字段缺失，不写 0
    end
  end

  # 隔离：与 main describe 的 before do 共享 stub 不冲突
  describe "route_leg_override:migrate_low_tier_road resilience" do
    let(:iso_tour) { create(:tour) }
    let(:iso_day) { iso_tour.days.first }

    # Rake task 是全局状态——跨测试 invoke 不会自动 reenable，必须显式重置。
    before { Rake::Task["route_leg_override:migrate_low_tier_road"].reenable }

    # Regression: 单条 leg AMAP ROUTE_FAIL 不应中断整个 rake。
    it "rescues AMAP failure on a single pair and continues" do
      bad_prev = create(:activity, tour: iso_tour, day: iso_day, lat: 36.0, lng: 103.0, position: 30)
      bad_road = build(:activity, tour: iso_tour, day: iso_day, kind: :road, citizen_level: :tier_two,
                       lat: 36.5, lng: 103.5, position: 31, name: "无路径段",
                       details: { "km" => 100, "drive_min" => 90 })
      bad_road.save!(validate: false)
      bad_next = create(:activity, tour: iso_tour, day: iso_day, lat: 37.0, lng: 104.0, position: 32)

      good_prev = create(:activity, tour: iso_tour, day: iso_day, lat: 38.0, lng: 105.0, position: 40)
      good_road = build(:activity, tour: iso_tour, day: iso_day, kind: :road, citizen_level: :tier_two,
                        lat: 38.5, lng: 105.5, position: 41, name: "正常段",
                        details: { "km" => 50, "drive_min" => 60 })
      good_road.save!(validate: false)
      good_next = create(:activity, tour: iso_tour, day: iso_day, lat: 39.0, lng: 106.0, position: 42)

      bad_id = bad_road.id
      allow_any_instance_of(AmapDirectionService).to receive(:fetch) do |_, **kwargs|
        # bad_road's pair: prev (lat 36, lng 103) → next (lat 37, lng 104). AMAP raise.
        if (kwargs[:from_lat] - 36.0).abs < 0.01 && (kwargs[:to_lat] - 37.0).abs < 0.01
          raise AmapDirectionService::Error, "AMAP 错误：ROUTE_FAIL"
        end
        { distance_m: 50_000, duration_s: 3600, polyline: { "coords" => [] } }
      end

      expect {
        Rake::Task["route_leg_override:migrate_low_tier_road"].invoke
      }.not_to raise_error

      good_leg = RouteLeg.find_by(from_activity_id: good_prev.id, to_activity_id: good_next.id)
      expect(good_leg).to be_present
      expect(good_leg.distance_m_override).to eq(50_000)
      bad_leg = RouteLeg.find_by(from_activity_id: bad_prev.id, to_activity_id: bad_next.id)
      expect(bad_leg).to be_nil  # AMAP failed, no leg created
    end

    # Regression: re-running rake should not double-count override on already-migrated legs.
    it "is idempotent: skips legs already overridden by previous run" do
      bare_prev = create(:activity, tour: iso_tour, day: iso_day, lat: 36.0, lng: 103.0, position: 50)
      idem_road = build(:activity, tour: iso_tour, day: iso_day, kind: :road, citizen_level: :tier_two,
                        lat: 36.5, lng: 103.5, position: 51, name: "幂等测试",
                        details: { "km" => 100, "drive_min" => 90 })
      idem_road.save!(validate: false)
      bare_next = create(:activity, tour: iso_tour, day: iso_day, lat: 37.0, lng: 104.0, position: 52)

      allow_any_instance_of(AmapDirectionService).to receive(:fetch).and_return(
        distance_m: 80_000, duration_s: 5400, polyline: { "coords" => [] }
      )

      Rake::Task["route_leg_override:migrate_low_tier_road"].invoke
      leg = RouteLeg.find_by(from_activity_id: bare_prev.id, to_activity_id: bare_next.id)
      first_dist = leg.distance_m_override
      expect(first_dist).to eq(100_000)

      Rake::Task["route_leg_override:migrate_low_tier_road"].reenable
      Rake::Task["route_leg_override:migrate_low_tier_road"].invoke
      leg.reload
      expect(leg.distance_m_override).to eq(first_dist)  # 没 double
    end
  end

  describe "route_leg_override:rename_scenic_road_details" do
    it "renames from_name/to_name to start_name/end_name for tier_one road" do
      a = create(:activity, tour: tour, day: day, kind: :road, citizen_level: :tier_one,
                 lat: 42.9, lng: 83.5, position: 1,
                 details: { "from_name" => "南入口", "to_name" => "北出口", "km" => 120 })
      Rake::Task["route_leg_override:rename_scenic_road_details"].reenable
      Rake::Task["route_leg_override:rename_scenic_road_details"].invoke
      a.reload
      expect(a.details["start_name"]).to eq("南入口")
      expect(a.details["end_name"]).to eq("北出口")
      expect(a.details).not_to have_key("from_name")
      expect(a.details).not_to have_key("to_name")
      expect(a.details["km"]).to eq(120)  # unchanged
    end

    it "is idempotent (running twice is safe)" do
      a = create(:activity, tour: tour, day: day, kind: :road, citizen_level: :tier_one,
                 lat: 42.9, lng: 83.5, position: 1,
                 details: { "start_name" => "南入口" })  # already migrated
      Rake::Task["route_leg_override:rename_scenic_road_details"].reenable
      Rake::Task["route_leg_override:rename_scenic_road_details"].invoke
      a.reload
      expect(a.details["start_name"]).to eq("南入口")
    end
  end

  describe "route_leg_override:delete_low_tier_road" do
    it "destroys non-tier_one road activities and renumbers positions" do
      a1 = create(:activity, tour: tour, day: day, lat: 36.0, lng: 103.0, position: 1)
      low = build(:activity, tour: tour, day: day, kind: :road, citizen_level: :tier_two,
                  lat: 36.5, lng: 103.5, position: 2, details: { "km" => 10 })
      low.save!(validate: false)  # bypass validation
      a3 = create(:activity, tour: tour, day: day, lat: 37.0, lng: 104.0, position: 3)

      Rake::Task["route_leg_override:delete_low_tier_road"].reenable
      Rake::Task["route_leg_override:delete_low_tier_road"].invoke

      expect(Activity.exists?(low.id)).to be false
      expect(a1.reload.position).to eq(1)
      expect(a3.reload.position).to eq(2)  # renumbered
    end

    it "leaves tier_one road activities untouched" do
      scenic = create(:activity, :scenic_road, tour: tour, day: day, position: 1)
      Rake::Task["route_leg_override:delete_low_tier_road"].reenable
      Rake::Task["route_leg_override:delete_low_tier_road"].invoke
      expect(Activity.exists?(scenic.id)).to be true
    end
  end
end
