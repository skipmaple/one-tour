class TourBudgetsController < ApplicationController
  before_action :require_login
  before_action :set_tour, only: [ :create ]
  before_action :set_budget, only: [ :update, :destroy ]
  before_action :require_editor

  def create
    # user_id is derived from current_user — budgets are always "my budget".
    # Clients shouldn't set this; the permit list enforces that too.
    budget = @tour.tour_budgets.build(budget_params.merge(user_id: current_user.id))
    if budget.save
      respond_with_success(budget_json(budget))
    else
      respond_with_error(budget.errors.full_messages.join("；"))
    end
  rescue ActiveRecord::RecordNotUnique
    # Partial unique index (per scope) can raise here even when model validations pass.
    respond_with_error("已有同范围的预算，请改用更新")
  end

  def update
    if @budget.update(budget_params)
      respond_with_success(budget_json(@budget))
    else
      respond_with_error(@budget.errors.full_messages.join("；"))
    end
  rescue ActiveRecord::RecordNotUnique
    respond_with_error("已有同范围的预算")
  end

  def destroy
    @budget.destroy!
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

    def set_budget
      @budget = TourBudget.find(params[:id])
      @tour = @budget.tour
    end

    def require_editor
      head(:forbidden) unless @tour.editable_by?(current_user)
    end

    def budget_params
      # user_id is intentionally not permitted — create() overrides it with
      # current_user.id so clients can only manage their own budgets.
      params.require(:tour_budget).permit(:day_id, :activity_id, :amount_cents)
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

    def budget_json(budget)
      {
        id: budget.id,
        tour_id: budget.tour_id,
        user_id: budget.user_id,
        day_id: budget.day_id,
        activity_id: budget.activity_id,
        scope: budget.scope,
        amount_cents: budget.amount_cents
      }
    end
end
