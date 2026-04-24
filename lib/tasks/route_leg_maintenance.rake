namespace :route_leg_maintenance do
  # 历史数据修复：AMAP v5 parser 在修复前会把所有 route_leg 的 duration_s 存成 0
  # （v5 把 duration 藏在 path.cost.duration 里，需要 show_fields=cost）。
  # 这个任务：把 `duration_s=0 AND distance_m>0` 的 leg 的 endpoint_digest 清空，
  # 然后立刻 refetch（不依赖用户下次触发 RouteLegsBatch）。
  #
  # 幂等：跑第二遍看不到 duration=0 的 leg 就是 no-op。
  # 节流：AmapDirectionService 自带 CUQPS 退避重试，无需本 rake 额外节流。
  #
  # 用法：
  #   DRY_RUN=1 bin/rails route_leg_maintenance:refetch_zero_duration
  #   bin/rails route_leg_maintenance:refetch_zero_duration
  desc "Refetch route_legs with duration_s=0 (fix AMAP v5 parser regression; DRY_RUN=1 to preview)"
  task refetch_zero_duration: :environment do
    dry_run = ENV["DRY_RUN"] == "1"

    legs = RouteLeg.where(duration_s: 0).where.not(distance_m: 0)
    puts "=== route_leg_maintenance:refetch_zero_duration ==="
    puts "DRY_RUN" if dry_run
    puts "Found #{legs.count} legs with duration_s=0 and distance_m>0"

    if dry_run
      legs.limit(20).each do |leg|
        puts "  id=#{leg.id} tour=#{leg.tour_id} #{leg.distance_m}m dur_override=#{leg.duration_s_override.inspect}"
      end
      puts "  ... (truncated, showing first 20)" if legs.count > 20
      next
    end

    ok = 0
    failed = []
    legs.find_each do |leg|
      begin
        # Invalidate cache via polyline (not endpoint_digest). Upsert.cache_valid?
        # checks `polyline.present? && digest == expected`; clearing polyline forces
        # a refetch. Crucially, leaving digest intact lets Upsert see "no endpoint
        # change" and PRESERVE the user's override fields. If we cleared digest
        # instead, Upsert would treat it as endpoint change and wipe overrides.
        leg.update_columns(polyline: {})

        result = RouteLeg::Upsert.new(
          tour:             leg.tour,
          from_activity_id: leg.from_activity_id,
          to_activity_id:   leg.to_activity_id,
          mode:             leg.mode
        ).call
        ok += 1
        puts "  ✓ id=#{leg.id}: duration_s #{leg.duration_s} → #{result.duration_s}"
      rescue => e
        failed << { id: leg.id, error: "#{e.class}: #{e.message[0..80]}" }
        puts "  ✗ id=#{leg.id}: #{e.class}"
      end
    end

    puts ""
    puts "Refetched successfully: #{ok}"
    puts "Failed:                 #{failed.size}"
    failed.each { |f| puts "  id=#{f[:id]} #{f[:error]}" }
  end
end
