class AmapDirectionsController < ApplicationController
  before_action :require_login

  COORD_RE = /\A-?\d+(\.\d+)?\z/

  def show
    coords = extract_coords
    return render(json: { error: "缺少或无效的起止坐标" }, status: :unprocessable_entity) if coords.nil?

    result = AmapDirectionService.new.fetch(
      from_lat: coords[:from_lat], from_lng: coords[:from_lng],
      to_lat:   coords[:to_lat],   to_lng:   coords[:to_lng],
      mode:     :driving
    )
    render json: { distance_m: result[:distance_m], duration_s: result[:duration_s] }
  rescue AmapDirectionService::Error => e
    render json: { error: e.message }, status: :bad_gateway
  end

  private
    # Validates that all 4 params are present + parseable as numbers. Returns nil
    # on any invalid/missing value (caller renders 422). Don't silently to_f nil
    # → 0.0, which would call AMAP with (0,0) and get a misleading 502 back.
    def extract_coords
      raw = {
        from_lat: params[:from_lat], from_lng: params[:from_lng],
        to_lat: params[:to_lat], to_lng: params[:to_lng]
      }
      return nil if raw.values.any? { |v| v.blank? || !v.to_s.match?(COORD_RE) }
      raw.transform_values(&:to_f)
    end
end
