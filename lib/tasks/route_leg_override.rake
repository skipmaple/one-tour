namespace :route_leg_override do
  desc "Migrate low-tier road activities to route_leg override (DRY_RUN=1 to preview)"
  task migrate_low_tier_road: :environment do
    dry_run = ENV["DRY_RUN"] == "1"
    report = { processed: 0, migrated: 0, orphaned: [], with_attachments: [] }

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

      leg = RouteLeg::Upsert.new(
        tour: road.tour, from_activity_id: prev_act.id, to_activity_id: next_act.id,
        mode: :driving
      ).call

      km = road.details["km"].to_f
      drive_min = road.details["drive_min"].to_i
      note = [ road.name, road.desc ].reject { |s| s.nil? || s.strip.empty? }.join(" · ")

      ActiveRecord::Base.transaction do
        leg.update!(
          distance_m_override: (leg.distance_m_override || 0) + (km * 1000).round,
          duration_s_override: (leg.duration_s_override || 0) + (drive_min * 60),
          note: [ leg.note, note ].reject { |s| s.nil? || s.strip.empty? }.join(" / ").presence,
          overridden_at: Time.current,
          overridden_by_id: road.tour.author_id,
        )
      end
      report[:migrated] += 1
    end

    puts "=== route_leg_override:migrate_low_tier_road report ==="
    puts "DRY_RUN" if dry_run
    puts "处理活动数: #{report[:processed]}"
    puts "已迁移到 override: #{report[:migrated]}"
    puts "孤立首/末活动（数据丢失）: #{report[:orphaned].size}"
    report[:orphaned].each { |r| puts "  - id=#{r[:id]} name=#{r[:name]}" }
    puts "关联 expense/image: #{report[:with_attachments].size}"
    report[:with_attachments].each { |r| puts "  - id=#{r[:id]} type=#{r[:type]}" }
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
