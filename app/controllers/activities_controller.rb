class ActivitiesController < ApplicationController
  before_action :require_login

  def create
    if params[:day_id]
      day = Day.find(params[:day_id])
      tour = day.tour
      head :forbidden and return unless tour.editable_by?(current_user)
      @activity = tour.activities.create!(activity_params.merge(day: day, position: next_position(tour, day)))
    else
      tour = Tour.find(params[:tour_id])
      head :forbidden and return unless tour.editable_by?(current_user)
      @activity = tour.activities.create!(activity_params.merge(day: nil, position: next_position(tour, nil)))
    end
    respond_to do |format|
      format.json { render json: { id: @activity.id, position: @activity.position } }
      format.html { redirect_to @activity.tour }
    end
  end

  def update
    activity = Activity.find(params[:id])
    head :forbidden and return unless activity.tour.editable_by?(current_user)
    activity.update!(activity_params)
    redirect_to activity.tour
  end

  def destroy
    activity = Activity.find(params[:id])
    head :forbidden and return unless activity.tour.editable_by?(current_user)
    activity.destroy!
    redirect_to activity.tour
  end

  private
    def activity_params
      params.require(:activity).permit(
        :name, :kind, :citizen_level, :lat, :lng, :address,
        :planned_start_at, :planned_duration_min, :desc,
        details: {}
      )
    end

    def next_position(tour, day)
      scope = day ? tour.activities.where(day_id: day.id) : tour.activities.where(day_id: nil)
      scope.maximum(:position).to_i + 1
    end
end
