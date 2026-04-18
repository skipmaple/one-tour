class ExpenseSplit < ApplicationRecord
  belongs_to :expense
  belongs_to :user

  validates :shares, numericality: { only_integer: true, greater_than: 0 }
  validates :amount_cents, presence: true
  validates :user_id, uniqueness: { scope: :expense_id }
end
