class ChatChannel < ApplicationCable::Channel
  def subscribed
    guidebook = Guidebook.find(params[:guidebook_id])

    if guidebook.editable_by?(current_user)
      stream_from chat_stream_name(params[:guidebook_id])
    else
      reject
    end
  end

  private
    def chat_stream_name(guidebook_id)
      "chat_guidebook_#{guidebook_id}_user_#{current_user.id}"
    end
end
