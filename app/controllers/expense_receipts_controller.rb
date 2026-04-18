class ExpenseReceiptsController < ApplicationController
  before_action :require_login

  def create
    expense = Expense.find(params[:expense_id])
    head :forbidden and return unless expense.tour.editable_by?(current_user)

    receipt = expense.receipts.build(
      uploaded_by: current_user,
      position: next_position(expense)
    )
    receipt.file.attach(params[:file]) if params[:file].present?

    if receipt.save
      render json: receipt_json(receipt)
    else
      render json: { errors: receipt.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def destroy
    receipt = ExpenseReceipt.find(params[:id])
    head :forbidden and return unless receipt.expense.tour.editable_by?(current_user)
    receipt.destroy!
    head :no_content
  end

  private
    def next_position(expense)
      expense.receipts.maximum(:position).to_i + 1
    end

    def receipt_json(receipt)
      {
        id: receipt.id,
        expense_id: receipt.expense_id,
        position: receipt.position,
        url: receipt.file.attached? ? rails_blob_path(receipt.file, only_path: true) : nil
      }
    end
end
