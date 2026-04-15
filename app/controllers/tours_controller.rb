class ToursController < ApplicationController
  before_action :require_login
  before_action :set_tour, only: [ :show, :update, :destroy ]

  def index
    uid = current_user.id
    tours = Tour
      .left_joins(:tour_memberships)
      .where("tours.author_id = :uid OR tour_memberships.user_id = :uid", uid: uid)
      .distinct
      .includes(:tour_memberships)

    payload = tours.map { |t| tour_index_entry(t, uid) }
    render inertia: "Tour/Index", props: { tours: payload }
  end

  def show
    head :not_found and return unless @tour.visible_to?(current_user)
    render inertia: "Tour/Show", props: {
      tour: @tour.as_json,
      days: @tour.days.as_json,
      activities: @tour.activities.as_json,
      violations: Tour::ConstitutionCheck.for(@tour).map(&:to_h)
    }
  end

  def create
    @tour = Tour.create!(author: current_user, **tour_params)
    redirect_to tour_constitution_path(@tour)
  end

  def update
    head :forbidden and return unless @tour.editable_by?(current_user)
    @tour.update!(tour_params)
    redirect_to @tour
  end

  def destroy
    head :forbidden and return unless @tour.owned_by?(current_user)
    @tour.destroy!
    redirect_to tours_path
  end

  private
    def set_tour
      @tour = Tour.find_by(id: params[:id])
      head :not_found and return unless @tour
    end

    def tour_params
      params.require(:tour).permit(:title, :date_range, :vehicle, :team_size, :trip_style, :budget_per_person, :archived)
    end

    def tour_index_entry(tour, user_id)
      violations = Tour::ConstitutionCheck.for(tour)
      tour.as_json.merge(
        "days_count"       => tour.days.count,
        "activities_count" => tour.activities.count,
        "health"           => {
          "hard" => violations.count { |v| v.level == :hard },
          "soft" => violations.count { |v| v.level == :soft }
        },
        "my_role"          => role_on(tour, user_id),
        "last_activity_at" => tour.updated_at&.iso8601
      )
    end

    def role_on(tour, user_id)
      return "author" if tour.author_id == user_id
      tour.tour_memberships.find { |m| m.user_id == user_id }&.role || "reader"
    end
end
