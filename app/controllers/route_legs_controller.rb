class RouteLegsController < ApplicationController
  RATE_LIMIT  = 60
  RATE_WINDOW = 60

  before_action :require_login
  before_action :set_tour, only: [ :create ]
  before_action :set_leg, only: [ :destroy ]
  before_action :require_editor
  before_action :throttle!, only: [ :create ]

  def create
    leg = RouteLeg::Upsert.new(
      tour: @tour,
      from_activity_id: params[:from_activity_id],
      to_activity_id:   params[:to_activity_id],
      mode:             params[:mode].presence || "driving"
    ).call

    respond_with_success(leg_json(leg))
  rescue ActiveRecord::RecordNotFound
    respond_with_error("找不到对应的站点", status: :not_found)
  rescue AmapDirectionService::UnsupportedModeError => e
    respond_with_error(e.message, status: :unprocessable_entity)
  rescue AmapDirectionService::Error => e
    respond_with_error("地图路线服务暂时不可用，稍后再试", status: :bad_gateway, detail: e.message)
  rescue ActiveRecord::RecordInvalid => e
    respond_with_error(e.record.errors.full_messages.join("；"), status: :unprocessable_entity)
  end

  def destroy
    @leg.destroy!
    if inertia_request?
      redirect_to tour_path(@tour)
    else
      head :no_content
    end
  end

  private
    def set_tour
      @tour = Tour.find(params[:tour_id])
    end

    def set_leg
      @leg = RouteLeg.find(params[:id])
      @tour = @leg.tour
    end

    def require_editor
      head(:forbidden) unless @tour.editable_by?(current_user)
    end

    def throttle!
      key = "route_leg_upsert:#{current_user.id}:#{Time.current.to_i / RATE_WINDOW}"
      count = Rails.cache.increment(key, 1, expires_in: RATE_WINDOW.seconds)
      head :too_many_requests if count && count > RATE_LIMIT
    end

    def leg_json(leg)
      {
        id: leg.id,
        tour_id: leg.tour_id,
        from_activity_id: leg.from_activity_id,
        to_activity_id: leg.to_activity_id,
        mode: leg.mode,
        distance_m: leg.distance_m,
        duration_s: leg.duration_s,
        polyline: leg.polyline,
        fetched_at: leg.fetched_at
      }
    end

    # Inertia's router.post expects a redirect (or Inertia-rendered page).
    # When the request carries X-Inertia, redirect to the tour page so the
    # frontend's partial reload (only: ['route_legs']) picks up fresh data.
    # Non-Inertia callers (e.g. direct fetch() / specs) still get JSON.
    # #inertia_request? is defined in ApplicationController.
    def respond_with_success(json_body)
      if inertia_request?
        redirect_to tour_path(@tour)
      else
        render json: json_body
      end
    end

    def respond_with_error(message, status:, detail: nil)
      if inertia_request?
        redirect_to tour_path(@tour), alert: message
      else
        render json: { errors: [ message ], detail: detail }.compact, status: status
      end
    end
end
