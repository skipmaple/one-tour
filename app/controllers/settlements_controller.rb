class SettlementsController < ApplicationController
  before_action :require_login
  before_action :set_tour,       only: [ :create ]
  before_action :set_settlement, only: [ :destroy ]
  before_action :require_tour_access

  def create
    settlement = @tour.settlements.build(settlement_params.merge(recorded_by: current_user))
    if settlement.save
      respond_with_success(settlement_json(settlement))
    else
      respond_with_error(settlement.errors.full_messages.join("；"))
    end
  end

  def destroy
    # Only the person who recorded it, or an editor, can undo a settlement.
    unless @settlement.recorded_by_id == current_user.id || @tour.editable_by?(current_user)
      head :forbidden and return
    end
    @settlement.destroy!
    if inertia_request?
      redirect_to tour_path(@tour)
    else
      head :no_content
    end
  end

  private
    def set_tour
      @tour = Tour.find(params[:tour_id])
    end

    def set_settlement
      @settlement = Settlement.find(params[:id])
      @tour = @settlement.tour
    end

    def require_tour_access
      head(:forbidden) unless @tour.visible_to?(current_user)
    end

    def settlement_params
      params.require(:settlement).permit(:from_user_id, :to_user_id, :amount_cents, :settled_at, :note)
    end

    def respond_with_success(json_body)
      if inertia_request?
        redirect_to tour_path(@tour)
      else
        render json: json_body
      end
    end

    def respond_with_error(message)
      if inertia_request?
        redirect_to tour_path(@tour), alert: message
      else
        render json: { errors: [ message ] }, status: :unprocessable_entity
      end
    end

    def settlement_json(s)
      {
        id: s.id,
        tour_id: s.tour_id,
        from_user_id: s.from_user_id,
        to_user_id: s.to_user_id,
        amount_cents: s.amount_cents,
        settled_at: s.settled_at,
        note: s.note,
        recorded_by_id: s.recorded_by_id
      }
    end
end
