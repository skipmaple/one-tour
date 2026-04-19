class ExpensesController < ApplicationController
  before_action :require_login
  before_action :set_tour, only: [ :create ]
  before_action :set_expense, only: [ :update, :destroy ]
  before_action :require_editor

  def create
    expense = @tour.expenses.build(expense_params.merge(created_by: current_user))

    ActiveRecord::Base.transaction do
      expense.save!
      unless expense.split_individual?
        Expense::ComputeSplits.new(expense,
          participant_ids: params[:participant_ids],
          splits: Array(params[:splits]).map(&:to_unsafe_h)
        ).call
      end
    end

    respond_with_success(expense_json(expense))
  rescue ActiveRecord::RecordInvalid => e
    respond_with_error(e.record.errors.full_messages.join("；"))
  rescue ArgumentError => e
    respond_with_error(e.message)
  end

  def update
    ActiveRecord::Base.transaction do
      @expense.update!(expense_params)
      # Always recompute — the service destroy_all's existing splits first,
      # and the individual case is a clean no-op (just clears old rows). Without
      # this the guard would leak stale splits after an equal→individual switch.
      Expense::ComputeSplits.new(@expense,
        participant_ids: params[:participant_ids],
        splits: Array(params[:splits]).map(&:to_unsafe_h)
      ).call
    end

    respond_with_success(expense_json(@expense))
  rescue ActiveRecord::RecordInvalid => e
    respond_with_error(e.record.errors.full_messages.join("；"))
  rescue ArgumentError => e
    respond_with_error(e.message)
  end

  def destroy
    @expense.destroy!
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

    def set_expense
      @expense = Expense.find(params[:id])
      @tour = @expense.tour
    end

    def require_editor
      head(:forbidden) unless @tour.editable_by?(current_user)
    end

    def expense_params
      params.require(:expense).permit(
        :scope, :activity_id, :day_id, :paid_by_id,
        :amount_cents, :category, :note, :occurred_on,
        :split_strategy, :external_count, :external_attributed_to_id
      )
    end

    def respond_with_success(json_body)
      if inertia_request?
        redirect_to tour_path(@tour)
      else
        render json: json_body
      end
    end

    def respond_with_error(message, status: :unprocessable_entity)
      if inertia_request?
        redirect_to tour_path(@tour), alert: message
      else
        render json: { errors: [ message ] }, status: status
      end
    end

    def expense_json(expense)
      {
        id: expense.id,
        tour_id: expense.tour_id,
        activity_id: expense.activity_id,
        day_id: expense.day_id,
        scope: expense.scope,
        paid_by_id: expense.paid_by_id,
        amount_cents: expense.amount_cents,
        category: expense.category,
        split_strategy: expense.split_strategy,
        external_count: expense.external_count,
        external_attributed_to_id: expense.external_attributed_to_id,
        note: expense.note,
        occurred_on: expense.occurred_on,
        splits: expense.splits.map { |s| { user_id: s.user_id, shares: s.shares, amount_cents: s.amount_cents } }
      }
    end
end
