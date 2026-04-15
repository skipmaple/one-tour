class Conversations::MessagesController < ApplicationController
  before_action :require_login

  def create
    tour = Tour.find(params[:tour_id])
    head :forbidden and return unless tour.editable_by?(current_user)
    conversation = tour.conversations.find_or_create_by!(user: current_user)
    message = conversation.messages.create!(role: :user, content: params.require(:content))
    ChatStreamJob.perform_later(conversation.id, tour.id, current_user.id)
    render json: { message: message.as_json }
  end
end
