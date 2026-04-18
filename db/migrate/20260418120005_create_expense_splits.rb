class CreateExpenseSplits < ActiveRecord::Migration[8.0]
  def change
    create_table :expense_splits do |t|
      t.references :expense, null: false, foreign_key: { on_delete: :cascade }
      t.references :user,    null: false, foreign_key: true
      # "承担 N 人份" — external participants are folded into a specific
      # member's shares rather than creating ghost users.
      t.integer :shares, null: false, default: 1
      # Server-authoritative share amount. On save, sum(shares) * per_share_cents
      # should equal expense.amount_cents (rounding diff absorbed by payer).
      t.integer :amount_cents, null: false
      t.timestamps

      t.index [ :expense_id, :user_id ], unique: true
    end
  end
end
