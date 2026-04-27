namespace :storage do
  desc "Migrate active_storage_blobs.service_name FROM=cloudflare TO=aliyun_oss [APPLY=1]"
  task migrate_service_name: :environment do
    from = ENV["FROM"].to_s.strip
    to = ENV["TO"].to_s.strip
    apply = ENV["APPLY"] == "1"

    if from.empty? || to.empty?
      abort <<~MSG
        error: FROM and TO are required.
        usage: rake storage:migrate_service_name FROM=cloudflare TO=aliyun_oss [APPLY=1]
        Without APPLY=1 this is a dry run.
      MSG
    end

    blobs = ActiveStorage::Blob.where(service_name: from)
    count = blobs.count

    puts "active_storage_blobs migration"
    puts "  from:    #{from}"
    puts "  to:      #{to}"
    puts "  matched: #{count} rows"
    puts "  mode:    #{apply ? 'APPLY' : 'DRY RUN'}"

    if count.zero?
      puts "Nothing to migrate."
      next
    end

    puts
    puts "Sample (first 5):"
    blobs.limit(5).pluck(:id, :key, :filename, :byte_size).each do |id, key, filename, size|
      puts "  ##{id}  key=#{key.first(24)}…  #{filename}  (#{size} bytes)"
    end

    unless apply
      puts
      puts "→ Re-run with APPLY=1 to actually update."
      next
    end

    ActiveRecord::Base.transaction do
      updated = blobs.update_all(service_name: to)
      puts
      puts "✔ Updated #{updated} rows."
    end
  end
end
