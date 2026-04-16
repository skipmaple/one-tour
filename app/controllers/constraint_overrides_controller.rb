class ConstraintOverridesController < ApplicationController
  before_action :require_login
  before_action :set_tour

  def create
    head :forbidden and return unless @tour.editable_by?(current_user)

    @tour.record_override!(
      rule:   params.require(:rule),
      scope:  scope_param,
      reason: params.require(:reason)
    )
    redirect_to tour_path(@tour)
  end

  def destroy
    head :forbidden and return unless @tour.editable_by?(current_user)

    @tour.revoke_override!(
      rule:  params.require(:rule),
      scope: scope_param
    )
    redirect_to tour_path(@tour)
  end

  private
    def set_tour
      @tour = Tour.find_by(id: params[:tour_id])
      head :not_found and return unless @tour
    end

    def scope_param
      raw = params.fetch(:scope, {})
      hash = if raw.respond_to?(:to_unsafe_h)
        raw.to_unsafe_h
      else
        raw.is_a?(Hash) ? raw : {}
      end
      hash.transform_values { |v| v =~ /\A\d+\z/ ? v.to_i : v }
    end
end
