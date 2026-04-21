class ActivityParticipantsController < ApplicationController
  before_action :require_login
  before_action :set_activity
  before_action :require_editable

  def update
    ids = Array(params[:user_ids]).map(&:to_i).uniq
    ids &= @activity.tour.member_user_ids

    # find_or_create_by! (vs bare create!) makes the loop tolerate concurrent
    # PUTs racing on the same activity — without it, two requests can both pass
    # destroy_all before either commits, then both INSERT the same user_id and
    # one hits the unique index. find_or_create_by! is itself wrapped in a
    # short transaction by AR so the unique-index race is caught and retried.
    ActivityParticipant.transaction do
      @activity.activity_participants.destroy_all
      ids.each { |uid| @activity.activity_participants.find_or_create_by!(user_id: uid) }
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
