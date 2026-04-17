class ConversationsController < ApplicationController
  before_action :require_login

  def show
    tour = Tour.find(params[:tour_id])
    head :not_found and return unless tour.visible_to?(current_user)
    conversation = tour.conversations.find_or_create_by!(user: current_user)
    render json: {
      conversation: conversation.as_json,
      messages: conversation.messages.order(:created_at).as_json
    }
  end

  def destroy
    tour = Tour.find(params[:tour_id])
    head :forbidden and return unless tour.editable_by?(current_user)
    tour.conversations.where(user: current_user).destroy_all
    head :ok
  end
end
