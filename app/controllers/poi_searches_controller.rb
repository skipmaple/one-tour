class PoiSearchesController < ApplicationController
  RATE_LIMIT   = 60
  RATE_WINDOW  = 60

  before_action :require_login
  before_action :validate_query
  before_action :throttle!

  def index
    result = PoiSearch.new.search(
      params[:q],
      region_hint: params[:region_hint],
      near_lat:    params[:near_lat],
      near_lng:    params[:near_lng]
    )
    render json: { candidates: result }
  rescue PoiSearch::Error => e
    render json: { error: e.message }, status: :bad_gateway
  end

  private
    def validate_query
      q = params[:q].to_s
      if q.blank? || q.length > 80
        head :bad_request
      end
    end

    def throttle!
      key = "poi_search:#{current_user.id}:#{Time.current.to_i / RATE_WINDOW}"
      count = Rails.cache.increment(key, 1, expires_in: RATE_WINDOW.seconds)
      head :too_many_requests if count && count > RATE_LIMIT
    end
end
