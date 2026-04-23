class AmapDirectionsController < ApplicationController
  before_action :require_login

  def show
    result = AmapDirectionService.new.fetch(
      from_lat: params[:from_lat].to_f, from_lng: params[:from_lng].to_f,
      to_lat:   params[:to_lat].to_f,   to_lng:   params[:to_lng].to_f,
      mode:     :driving
    )
    render json: { distance_m: result[:distance_m], duration_s: result[:duration_s] }
  rescue AmapDirectionService::Error => e
    render json: { error: e.message }, status: :bad_gateway
  end
end
