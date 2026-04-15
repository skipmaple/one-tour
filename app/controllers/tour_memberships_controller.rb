class TourMembershipsController < ApplicationController
  before_action :require_login
  before_action :set_tour
  before_action :require_author

  def create
    user = User.find_by(email: params[:email])
    head :not_found and return unless user
    @tour.tour_memberships.create!(user: user, role: params[:role] || "reader")
    redirect_to @tour
  end

  def update
    membership = @tour.tour_memberships.find(params[:id])
    membership.update!(role: params[:role])
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
