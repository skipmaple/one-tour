class Guidebooks::ConversationsController < ApplicationController
  before_action :require_login
  before_action :set_guidebook
  before_action :require_editor

  def create
    conversation = @guidebook.conversations.find_or_create_by(user: current_user)
    render json: { conversation: conversation_json(conversation) }, status: :created
  end

  def show
    conversation = @guidebook.conversations.find(params[:id])

    if conversation.user_id == current_user.id
      render json: {
        conversation: conversation_json(conversation),
        messages: conversation.messages.order(:created_at).map { |m| message_json(m) }
      }
    else
      head :forbidden
    end
  end

  private
    def set_guidebook
      @guidebook = Guidebook.find(params[:guidebook_id])
    end

    def require_editor
      unless @guidebook.editable_by?(current_user)
        head :forbidden
      end
    end

    def conversation_json(conversation)
      { id: conversation.id, guidebook_id: conversation.guidebook_id, created_at: conversation.created_at }
    end

    def message_json(message)
      { id: message.id, role: message.role, content: message.content, created_at: message.created_at }
    end
end
