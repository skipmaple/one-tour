class CreateTourBudgets < ActiveRecord::Migration[8.0]
  def change
    create_table :tour_budgets do |t|
      t.references :tour, null: false, foreign_key: { on_delete: :cascade }
      # day/activity are independently nullable. Three levels:
      #   scope = activity  → activity_id present, day_id must be NULL
      #   scope = day       → day_id present, activity_id NULL
      #   scope = tour      → both NULL
      t.references :day,      foreign_key: { on_delete: :cascade }
      t.references :activity, foreign_key: { on_delete: :cascade }
      t.references :user, null: false, foreign_key: true
      t.integer :amount_cents, null: false, default: 0
      t.timestamps

      # Partial unique enforces each (tour, user) has at most one budget at each scope.
      t.index [ :tour_id, :activity_id, :user_id ],
              unique: true,
              where: "activity_id IS NOT NULL",
              name: "idx_tour_budgets_activity_scope"
      t.index [ :tour_id, :day_id, :user_id ],
              unique: true,
              where: "day_id IS NOT NULL AND activity_id IS NULL",
              name: "idx_tour_budgets_day_scope"
      t.index [ :tour_id, :user_id ],
              unique: true,
              where: "day_id IS NULL AND activity_id IS NULL",
              name: "idx_tour_budgets_tour_scope"
    end
  end
end
