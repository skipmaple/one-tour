class Tours::TimelinesController < ApplicationController
  before_action :require_login
  before_action :set_tour

  def show
    head :not_found and return unless @tour.visible_to?(current_user)
    tour_violations = Tour::ConstitutionCheck.for(@tour).map(&:to_h)
    render inertia: "Tour/Timeline", props: {
      tour: @tour.as_json.merge("editable_by_current_user" => @tour.editable_by?(current_user)),
      days: @tour.days.map { |d| d.as_json.merge("intensity_derived" => d.intensity_derived(tour_violations).to_s) },
      activities: @tour.activities.as_json,
      violations: tour_violations,
      summary: Tour::TimelineSummary.for(@tour)
    }
  end

  private
    def set_tour
      @tour = Tour.find_by(id: params[:tour_id])
      head :not_found and return unless @tour
    end
end
