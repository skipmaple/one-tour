module Admin
  class DashboardController < BaseController
    # Number of **calendar days** a range covers, inclusive of today.
    # Previously this was a sliding N×24h window which, when bucketed by
    # `created_at.to_date` in compute_trend, produced N+1 buckets (e.g.
    # "近 7 天" rendered 8 points). Aligning to calendar-day boundaries
    # makes the bucket count match the UI label.
    RANGES = { "today" => 1, "7d" => 7, "30d" => 30 }.freeze

    def show
      range = resolve_range
      render inertia: "Admin/Dashboard", props: {
        range: range_key,
        kpis:  compute_kpis(range),
        trend: compute_trend(range)
      }
    end

    private

    def range_key
      key = params[:range].to_s
      RANGES.key?(key) ? key : "7d"
    end

    def resolve_range
      days = RANGES.fetch(range_key)
      start_time = (days - 1).days.ago.in_time_zone.beginning_of_day
      start_time..Time.current
    end

    def compute_kpis(range)
      {
        "new_users":      User.where(created_at: range).count,
        "active_users":   active_user_count(range),
        "new_tours":      Tour.where(created_at: range).count,
        "active_tours":   Tour.where(updated_at: range).count,
        "llm_messages":   Message.billable.where(created_at: range).count,
        "llm_cost_cents": Message.billable.where(created_at: range).sum(:cost_cents).to_i
      }.stringify_keys
    end

    def active_user_count(range)
      tour_user_ids    = Tour.where(updated_at: range).pluck(:author_id)
      member_user_ids  = TourMembership.joins(:tour)
                                        .where(tours: { updated_at: range })
                                        .pluck(:user_id)
      message_user_ids = Message.billable.where(created_at: range)
                                .joins(conversation: :user).pluck("users.id")
      (tour_user_ids + member_user_ids + message_user_ids).uniq.size
    end

    def compute_trend(range)
      rows = Message.billable
                    .where(created_at: range)
                    .group("DATE_TRUNC('day', created_at)")
                    .pluck(Arel.sql("DATE_TRUNC('day', created_at)"),
                           Arel.sql("COUNT(*)"),
                           Arel.sql("COALESCE(SUM(cost_cents), 0)"))

      by_date = rows.to_h { |date, cnt, cost| [ date.to_date, { count: cnt, cost: cost } ] }
      days_in_range = ((range.begin.to_date)..(range.end.to_date)).to_a

      days_in_range.map do |d|
        bucket = by_date[d] || { count: 0, cost: 0 }
        {
          "date"       => d.iso8601,
          "messages"   => bucket[:count],
          "cost_cents" => bucket[:cost].to_i
        }
      end
    end
  end
end
