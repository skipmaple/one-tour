class ActivityParticipantsController < ApplicationController
  before_action :require_login
  before_action :set_activity
  before_action :require_editable

  def update
    ids = Array(params[:user_ids]).map(&:to_i).uniq
    ids &= @activity.tour.member_user_ids

    ActivityParticipant.transaction do
      @activity.activity_participants.destroy_all
      ids.each { |uid| @activity.activity_participants.create!(user_id: uid) }
    end
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
