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

    render json: leg_json(leg)
  rescue ActiveRecord::RecordNotFound
    head :not_found
  rescue AmapDirectionService::UnsupportedModeError => e
    render json: { errors: [ e.message ] }, status: :unprocessable_entity
  rescue AmapDirectionService::Error => e
    render json: { errors: [ "地图路线服务暂时不可用，稍后再试" ], detail: e.message }, status: :bad_gateway
  rescue ActiveRecord::RecordInvalid => e
    render json: { errors: e.record.errors.full_messages }, status: :unprocessable_entity
  end

  def destroy
    @leg.destroy!
    head :no_content
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
end
