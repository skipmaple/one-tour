class RouteLegsBatchesController < ApplicationController
  # A batch computes up to MAX_PAIRS adjacent-activity route legs in one pass.
  # Cached pairs short-circuit inside RouteLeg::Upsert (no Amap call), so this
  # is cheap for repeat invocations. Rate limit is looser than the per-leg
  # endpoint — one batch == one user action.
  MAX_PAIRS   = 100
  RATE_LIMIT  = 10
  RATE_WINDOW = 60

  before_action :require_login
  before_action :set_tour
  before_action :require_editor
  before_action :throttle!

  def create
    pairs = adjacent_pairs
    if pairs.size > MAX_PAIRS
      return respond_with_error("一次最多算 #{MAX_PAIRS} 段路线", status: :unprocessable_entity)
    end

    summary = { total: pairs.size, computed: 0, cached: 0, failed: 0, errors: [] }
    pairs.each do |from, to|
      result = upsert_one(from, to)
      summary[result[:status]] += 1
      summary[:errors] << result[:error] if result[:error]
    end

    respond_with_success(summary)
  end

  private
    def set_tour
      @tour = Tour.find(params[:tour_id])
    end

    def require_editor
      head(:forbidden) unless @tour.editable_by?(current_user)
    end

    # Mirrors RouteLegsController#throttle! shape but uses its own bucket.
    # Tight limit (10/min) because each batch may fan out to MAX_PAIRS Amap
    # calls on a cold-cache tour — we don't want someone looping batches.
    def throttle!
      key = "route_legs_batch:#{current_user.id}:#{Time.current.to_i / RATE_WINDOW}"
      count = Rails.cache.increment(key, 1, expires_in: RATE_WINDOW.seconds)
      head :too_many_requests if count && count > RATE_LIMIT
    end

    # Adjacent pairs in linear tour order: sort all day-assigned activities
    # with coords by (day_index, position), then take consecutive pairs.
    # Cross-day pairs (last of day N → first of day N+1) are included — same
    # treatment as PlannerMap.buildPolylineConfigs on the frontend.
    def adjacent_pairs
      ordered = @tour.activities
        .where.not(day_id: nil)
        .where.not(lat: nil).where.not(lng: nil)
        .joins(:day).order("days.day_index ASC, activities.position ASC")
        .to_a
      ordered.each_cons(2).to_a
    end

    # Distinguishes cached (cheap) vs computed (hit Amap) to drive an honest
    # toast — otherwise repeat-clicks look identical to fresh work.
    def upsert_one(from, to)
      existing = @tour.route_legs.find_by(
        from_activity_id: from.id, to_activity_id: to.id, mode: "driving"
      )
      was_fresh = existing&.cache_valid?

      RouteLeg::Upsert.new(
        tour: @tour, from_activity_id: from.id, to_activity_id: to.id, mode: "driving"
      ).call

      { status: was_fresh ? :cached : :computed }
    rescue AmapDirectionService::Error, ActiveRecord::RecordInvalid, ActiveRecord::RecordNotFound => e
      { status: :failed, error: "#{from.name} → #{to.name}: #{e.message}" }
    end

    def respond_with_success(summary)
      flash_msg = format_summary(summary)
      if inertia_request?
        redirect_to tour_path(@tour), notice: flash_msg
      else
        render json: summary
      end
    end

    def respond_with_error(message, status:)
      if inertia_request?
        redirect_to tour_path(@tour), alert: message
      else
        render json: { errors: [ message ] }, status: status
      end
    end

    def format_summary(summary)
      return "没有可计算的路线 — 先把活动排进某一天" if summary[:total].zero?
      parts = []
      parts << "算了 #{summary[:computed]} 段" if summary[:computed] > 0
      parts << "#{summary[:cached]} 段已缓存" if summary[:cached] > 0
      parts << "#{summary[:failed]} 段失败" if summary[:failed] > 0
      parts.join(" · ")
    end
end
