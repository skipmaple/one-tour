class CreateExpenseReceipts < ActiveRecord::Migration[8.0]
  def change
    create_table :expense_receipts do |t|
      t.references :expense, null: false, foreign_key: { on_delete: :cascade }
      t.references :uploaded_by, null: false, foreign_key: { to_table: :users }
      t.integer :position, null: false, default: 0
      t.timestamps

      t.index [ :expense_id, :position ]
    end
  end
end
