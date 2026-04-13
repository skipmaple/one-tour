class Guidebooks::MessagesController < ApplicationController
  before_action :require_login
  before_action :set_guidebook
  before_action :set_conversation

  def create
    if @conversation.user_id != current_user.id
      head :forbidden
      return
    end

    message = @conversation.messages.create!(role: :user, content: params[:content])
    mode = %w[auto ask plan].include?(params[:mode]) ? params[:mode] : "ask"
    ChatStreamJob.perform_later(@conversation.id, @guidebook.id, current_user.id, mode)

    render json: { message: message_json(message) }, status: :created
  end

  private
    def set_guidebook
      @guidebook = Guidebook.find(params[:guidebook_id])
    end

    def set_conversation
      @conversation = @guidebook.conversations.find(params[:conversation_id])
    end

    def message_json(message)
      { id: message.id, role: message.role, content: message.content, created_at: message.created_at }
    end
end
