class TourMembershipsController < ApplicationController
  ALLOWED_ROLES = %w[reader editor].freeze

  before_action :require_login
  before_action :set_tour
  before_action :require_author

  def create
    role = params[:role].presence || "reader"
    head :unprocessable_entity and return unless ALLOWED_ROLES.include?(role)
    user = User.find_by(email: params[:email])
    head :not_found and return unless user
    @tour.tour_memberships.create!(user: user, role: role)
    redirect_to @tour
  end

  def update
    membership = @tour.tour_memberships.find(params[:id])

    attrs = {}
    if params.key?(:role)
      head :unprocessable_entity and return unless ALLOWED_ROLES.include?(params[:role])
      attrs[:role] = params[:role]
    end
    if params.key?(:participating_day_ids)
      attrs[:participating_day_ids] = Array(params[:participating_day_ids]).map(&:to_i)
    end

    membership.update!(attrs)
    redirect_to @tour
  end

  def destroy
    membership = @tour.tour_memberships.find(params[:id])
    membership.destroy!
    redirect_to @tour
  end

  private
    def set_tour
      @tour = Tour.find(params[:tour_id])
    end

    def require_author
      head(:forbidden) unless @tour.owned_by?(current_user)
    end
end
