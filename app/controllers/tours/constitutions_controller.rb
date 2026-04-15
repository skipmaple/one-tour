class Tours::ConstitutionsController < ApplicationController
  before_action :require_login
  before_action :set_tour

  def show
    head :not_found and return unless @tour.visible_to?(current_user)
    render inertia: "Tour/Constitution", props: {
      tour: @tour.as_json,
      constitution: @tour.constitution,
      defaults: Constitution::DEFAULTS.deep_stringify_keys
    }
  end

  def update
    head :forbidden and return unless @tour.editable_by?(current_user)
    allowed = Constitution::DEFAULTS.keys.map(&:to_s)
    safe = params.require(:constitution).permit(*allowed).to_h
    @tour.update!(constitution: @tour.constitution.merge(safe))
    redirect_to @tour
  end

  private
    def set_tour
      @tour = Tour.find_by(id: params[:tour_id])
      head :not_found and return unless @tour
    end
end
