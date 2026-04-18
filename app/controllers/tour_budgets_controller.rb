class TourBudgetsController < ApplicationController
  before_action :require_login
  before_action :set_tour, only: [ :create ]
  before_action :set_budget, only: [ :update, :destroy ]
  before_action :require_editor

  def create
    budget = @tour.tour_budgets.build(budget_params)
    if budget.save
      render json: budget_json(budget)
    else
      render json: { errors: budget.errors.full_messages }, status: :unprocessable_entity
    end
  rescue ActiveRecord::RecordNotUnique
    # Partial unique index (per scope) can raise here even when model validations pass.
    render json: { errors: [ "已有同范围的预算，请改用更新" ] }, status: :unprocessable_entity
  end

  def update
    if @budget.update(budget_params)
      render json: budget_json(@budget)
    else
      render json: { errors: @budget.errors.full_messages }, status: :unprocessable_entity
    end
  rescue ActiveRecord::RecordNotUnique
    render json: { errors: [ "已有同范围的预算" ] }, status: :unprocessable_entity
  end

  def destroy
    @budget.destroy!
    head :no_content
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
      params.require(:tour_budget).permit(:user_id, :day_id, :activity_id, :amount_cents)
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
