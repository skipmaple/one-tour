namespace :route_leg_override do
  desc "Migrate low-tier road activities to route_leg override (DRY_RUN=1 to preview)"
  task migrate_low_tier_road: :environment do
    dry_run = ENV["DRY_RUN"] == "1"
    report = { processed: 0, migrated: 0, skipped_already_migrated: 0,
               orphaned: [], with_attachments: [], amap_failed: [] }

    Activity.where(kind: :road).where.not(citizen_level: :tier_one).find_each do |road|
      report[:processed] += 1
      prev_act = road.day&.activities&.where("position < ?", road.position)&.order(:position)&.last
      next_act = road.day&.activities&.where("position > ?", road.position)&.order(:position)&.first

      if prev_act.nil? || next_act.nil?
        report[:orphaned] << { id: road.id, name: road.name, day_id: road.day_id }
        next
      end

      # Flag activities with expense/image associations if the model exposes them
      if road.respond_to?(:expenses) && road.expenses.any?
        report[:with_attachments] << { id: road.id, type: "expense" }
      end
      if road.respond_to?(:activity_images) && road.activity_images.any?
        report[:with_attachments] << { id: road.id, type: "image" }
      end

      next if dry_run

      # 幂等前置检查：先查现有 leg 是否已 overridden（rake 中途崩 re-run 场景）。
      # 放在 Upsert 之前能 (a) 省掉 find_or_initialize_by 的查询；(b) 避免 cache
      # invalid 时的 AMAP 调用；(c) 防止 endpoint_changed 分支可能清掉 override。
      # 用户老 override 在 migrate 前已确认 0 条，所以 overridden_at.present?
      # 就是本 rake 留下的。
      existing_leg = road.tour.route_legs.find_by(
        from_activity_id: prev_act.id, to_activity_id: next_act.id, mode: :driving
      )
      if existing_leg&.overridden_at.present?
        report[:skipped_already_migrated] += 1
        next
      end

      # Per-iteration rescue：单个 leg 的 AMAP 调用失败（ROUTE_FAIL 等）不应
      # 中断整个 rake。继续处理后续 activity，最后报告失败列表让 ops 人工补。
      begin
        leg = RouteLeg::Upsert.new(
          tour: road.tour, from_activity_id: prev_act.id, to_activity_id: next_act.id,
          mode: :driving
        ).call
      rescue AmapDirectionService::Error => e
        report[:amap_failed] << { id: road.id, name: road.name,
                                  prev_id: prev_act.id, next_id: next_act.id,
                                  error: e.message[0..120] }
        next
      end

      # 源字段可能缺失（老数据里只填了 name/desc 没填 km/drive_min）。别把
      # nil.to_f → 0 写成 override——那会让 effective_* 返 0、覆盖掉 AMAP
      # 原值。只迁实际有值的字段；都没值就跳过（activity 稍后被单独删除）。
      km_raw = road.details["km"]
      drive_min_raw = road.details["drive_min"]
      km = km_raw.present? ? km_raw.to_f : nil
      drive_min = drive_min_raw.present? ? drive_min_raw.to_i : nil
      note_text = [ road.name, road.desc ].reject { |s| s.nil? || s.strip.empty? }.join(" · ")

      has_km = km.present? && km > 0
      has_min = drive_min.present? && drive_min > 0
      has_note = note_text.present?

      unless has_km || has_min || has_note
        # 无可迁移数据，跳过（activity 在后续 delete 任务里清理）
        next
      end

      ActiveRecord::Base.transaction do
        merged_note = [ leg.note, note_text ].reject { |s| s.nil? || s.strip.empty? }.join(" / ").presence

        attrs = { overridden_at: Time.current, overridden_by_id: road.tour.author_id, note: merged_note }
        attrs[:distance_m_override] = (leg.distance_m_override || 0) + (km * 1000).round if has_km
        attrs[:duration_s_override] = (leg.duration_s_override || 0) + (drive_min * 60)    if has_min
        leg.update!(attrs)
      end
      report[:migrated] += 1
    end

    puts "=== route_leg_override:migrate_low_tier_road report ==="
    puts "DRY_RUN" if dry_run
    puts "处理活动数: #{report[:processed]}"
    puts "已迁移到 override: #{report[:migrated]}"
    puts "已跳过（重跑时已迁移过）: #{report[:skipped_already_migrated]}"
    puts "孤立首/末活动（数据丢失）: #{report[:orphaned].size}"
    report[:orphaned].each { |r| puts "  - id=#{r[:id]} name=#{r[:name]}" }
    puts "关联 expense/image: #{report[:with_attachments].size}"
    report[:with_attachments].each { |r| puts "  - id=#{r[:id]} type=#{r[:type]}" }
    puts "AMAP 路径计算失败（需人工补 override）: #{report[:amap_failed].size}"
    report[:amap_failed].each do |r|
      puts "  - id=#{r[:id]} name=#{r[:name]} (prev=#{r[:prev_id]} next=#{r[:next_id]}) err: #{r[:error]}"
    end
  end

  desc "Rename scenic road details keys from_name/to_name → start_name/end_name"
  task rename_scenic_road_details: :environment do
    count = 0
    Activity.where(kind: :road, citizen_level: :tier_one).find_each do |a|
      d = a.details || {}
      changed = false
      if d.key?("from_name")
        d["start_name"] = d.delete("from_name")
        changed = true
      end
      if d.key?("to_name")
        d["end_name"] = d.delete("to_name")
        changed = true
      end
      if changed
        a.update_column(:details, d)
        count += 1
      end
    end
    puts "改名 tier_one road activity: #{count}"
  end

  desc "Delete low-tier road activities (run AFTER migrate_low_tier_road)"
  task delete_low_tier_road: :environment do
    count = 0
    Activity.where(kind: :road).where.not(citizen_level: :tier_one).find_each do |a|
      a.destroy!
      count += 1
    end
    puts "删除低 tier road activity: #{count}"

    # Renumber positions per day
    Day.joins(:activities).distinct.find_each do |d|
      d.activities.order(:position).each_with_index do |act, i|
        act.update_column(:position, i + 1)
      end
    end
    puts "重排 day positions 完成"
  end
end
