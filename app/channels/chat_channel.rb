class ChatChannel < ApplicationCable::Channel
  def subscribed
    tour = Tour.find_by(id: params[:tour_id])
    if tour&.visible_to?(current_user)
      stream_from "chat_tour_#{tour.id}_user_#{current_user.id}"
    else
      reject
    end
  end
end
