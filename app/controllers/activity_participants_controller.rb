class ActivityParticipantsController < ApplicationController
  before_action :require_login
  before_action :set_activity
  before_action :require_editable

  def update
    @activity.assign_participants!(params[:user_ids])
    redirect_to @activity.tour
  end

  private
    def set_activity
      @activity = Activity.find(params[:activity_id])
    end

    def require_editable
      head(:forbidden) unless @activity.tour.editable_by?(current_user)
    end
end
