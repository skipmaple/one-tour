class ActivityPositionsController < ApplicationController
  before_action :require_login

  def update
    activity = Activity.find(params[:activity_id])
    head :forbidden and return unless activity.tour.editable_by?(current_user)
    target_day = params[:to_day_id].present? ? activity.tour.days.find(params[:to_day_id]) : nil
    activity.update!(day: target_day, position: params.require(:to_position).to_i)
    head :ok
  end
end
