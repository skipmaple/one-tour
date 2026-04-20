module Admin
  class DashboardController < BaseController
    RANGES = { "today" => 1.day, "7d" => 7.days, "30d" => 30.days }.freeze

    def show
      range = resolve_range
      render inertia: "Admin/Dashboard", props: {
        range: range_key,
        kpis:  compute_kpis(range)
      }
    end

    private

    def range_key
      key = params[:range].to_s
      RANGES.key?(key) ? key : "7d"
    end

    def resolve_range
      (Time.current - RANGES.fetch(range_key))..Time.current
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
  end
end
