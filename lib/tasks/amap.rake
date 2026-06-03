namespace :amap do
  # Backfill AMAP place metadata onto a tour's existing activities.
  #   bin/rails "amap:enrich_tour[17]"
  # Idempotent: activities that already have details.place are skipped. Sleeps
  # between live AMAP calls to stay under the ~3 QPS free-tier limit.
  desc "Backfill AMAP place metadata (rating/hours/photo) onto a tour's activities"
  task :enrich_tour, [ :tour_id ] => :environment do |_t, args|
    tour = Tour.find(args.fetch(:tour_id))
    enricher = ActivityPlaceEnricher.new
    counts = Hash.new(0)

    tour.activities.order(:day_id, :position).each do |activity|
      result = enricher.enrich!(activity)
      counts[result] += 1
      puts format("%-18s %s", result, activity.name)
      # Only :enriched / :no_match actually hit AMAP — pace those.
      sleep 0.4 if %i[enriched no_match].include?(result)
    rescue => e
      counts[:error] += 1
      puts format("%-18s %s — %s", "error", activity.name, e.message[0, 80])
    end

    puts "—" * 40
    puts counts.sort_by { |_, v| -v }.map { |k, v| "#{k}: #{v}" }.join("  ")
  end
end
