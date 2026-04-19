class RouteLegsBatchesController < ApplicationController
  # A batch computes up to MAX_PAIRS adjacent-activity route legs in one pass.
  # Cached pairs short-circuit inside RouteLeg::Upsert (no Amap call), so this
  # is cheap for repeat invocations. Rate limit is looser than the per-leg
  # endpoint — one batch == one user action.
  MAX_PAIRS   = 100
  RATE_LIMIT  = 10
  RATE_WINDOW = 60
  # Sleep between Amap-hitting upserts to stay under Amap's ~3 QPS per-key
  # cap. 0.35s → ~2.85 QPS, comfortably below. Cached pairs skip the sleep
  # (they don't call Amap at all). Service-level retry covers the residual
  # case where two editors batch concurrently and share the QPS budget.
  INTER_CALL_DELAY = 0.35

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
    pairs.each_with_index do |(from, to), i|
      result = upsert_one(from, to)
      summary[result[:status]] += 1
      summary[:errors] << result[:error] if result[:error]

      # Space Amap calls apart to stay under ~3 QPS. Sleep only when this
      # call AND the next will both hit Amap — if either is a cache hit,
      # no rate limiter is being loaded. The peek costs one find_by per
      # iteration but saves a 0.35s sleep whenever a computed pair is
      # followed by a cached one (common in partially-cached tours).
      next_pair = pairs[i + 1]
      if next_pair && result[:status] != :cached && !next_pair_cached?(*next_pair)
        sleep(INTER_CALL_DELAY)
      end
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
    # toast — otherwise repeat-clicks look identical to fresh work. Reads
    # RouteLeg::Upsert#cache_hit? after the call, so we avoid duplicating
    # the cache-validity check in the controller (saves ~1 query per pair).
    def upsert_one(from, to)
      upsert = RouteLeg::Upsert.new(
        tour: @tour, from_activity_id: from.id, to_activity_id: to.id, mode: "driving"
      )
      upsert.call
      { status: upsert.cache_hit? ? :cached : :computed }
    rescue AmapDirectionService::Error, ActiveRecord::RecordInvalid, ActiveRecord::RecordNotFound => e
      { status: :failed, error: "#{from.name} → #{to.name}: #{e.message}" }
    end

    # Peek at the next pair's cache state without triggering an Amap call.
    # Used by the rate-limiter loop to skip sleeps when the next iteration
    # is a guaranteed cache hit. Returns false when no leg exists yet or
    # the endpoint coords no longer match (endpoint_digest stale).
    def next_pair_cached?(from, to)
      leg = @tour.route_legs.find_by(
        from_activity_id: from.id, to_activity_id: to.id, mode: "driving"
      )
      return false unless leg
      # Attach pre-loaded activities so expected_endpoint_digest doesn't
      # fire additional queries via the belongs_to associations.
      leg.from_activity = from
      leg.to_activity = to
      leg.cache_valid?
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
