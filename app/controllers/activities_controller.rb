class ActivitiesController < ApplicationController
  before_action :require_login

  def create
    if params[:day_id]
      day = Day.find(params[:day_id])
      tour = day.tour
    else
      tour = Tour.find(params[:tour_id])
      day = nil
    end
    head :forbidden and return unless tour.editable_by?(current_user)

    ActiveRecord::Base.transaction do
      @activity = tour.activities.create!(activity_params.merge(day: day, position: next_position(tour, day)))
      @activity.assign_participants!(params[:user_ids]) if params.key?(:user_ids)
    end

    respond_to do |format|
      format.json { render json: { id: @activity.id, position: @activity.position } }
      format.html { redirect_to tour }
    end
  rescue ActiveRecord::RecordInvalid => e
    respond_with_error(tour, e.record.errors.full_messages.join("；"))
  end

  def update
    activity = Activity.find(params[:id])
    head :forbidden and return unless activity.tour.editable_by?(current_user)
    ActiveRecord::Base.transaction do
      activity.update!(activity_params)
      activity.assign_participants!(params[:user_ids]) if params.key?(:user_ids)
    end
    redirect_to activity.tour
  rescue ActiveRecord::RecordInvalid => e
    respond_with_error(activity.tour, e.record.errors.full_messages.join("；"))
  end

  def destroy
    activity = Activity.find(params[:id])
    head :forbidden and return unless activity.tour.editable_by?(current_user)
    activity.destroy!
    redirect_to activity.tour
  end

  def clone
    source = Activity.find(params[:id])
    head :forbidden and return unless source.tour.editable_by?(current_user)
    new_activity = source.clone_for_same_day!
    render json: { id: new_activity.id, position: new_activity.position }
  end

  private
    # Mirrors ExpensesController's pattern: Inertia callers get redirect+flash
    # (raw JSON pops an "invalid response" modal); fetch callers get 422 JSON.
    # See ApplicationController#inertia_request? for the full rationale.
    def respond_with_error(tour, message)
      message = "保存失败" if message.blank?
      if inertia_request?
        redirect_to tour, alert: message
      else
        render json: { errors: [ message ] }, status: :unprocessable_entity
      end
    end

    def activity_params
      params.require(:activity).permit(
        :name, :kind, :citizen_level, :status, :lat, :lng, :address,
        :planned_start_at, :planned_duration_min, :desc,
        details: {}
      )
    end

    def next_position(tour, day)
      scope = day ? tour.activities.where(day_id: day.id) : tour.activities.where(day_id: nil)
      scope.maximum(:position).to_i + 1
    end
end
