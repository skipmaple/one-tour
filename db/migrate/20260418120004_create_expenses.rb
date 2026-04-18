class CreateExpenses < ActiveRecord::Migration[8.0]
  def change
    create_table :expenses do |t|
      t.references :tour,     null: false, foreign_key: { on_delete: :cascade }
      # scope: activity:0 / day:1 / tour:2 (enum on the model).
      t.integer    :scope,    null: false, default: 0
      # For activity-scope, activity_id is set and day_id is auto-synced to
      # activity.day_id via before_validation (so aggregations can group by day
      # without joining activities). For day-scope, day_id is set directly.
      # For tour-scope, both are NULL.
      t.references :activity, foreign_key: { on_delete: :cascade }
      t.references :day,      foreign_key: { on_delete: :cascade }
      t.references :paid_by,  null: false, foreign_key: { to_table: :users }
      t.references :created_by, null: false, foreign_key: { to_table: :users }
      # Signed to allow refunds (negative).
      t.integer    :amount_cents,  null: false
      t.integer    :category,      null: false, default: 0   # food/fuel/lodging/ticket/refund/misc
      # split_strategy = none → no ExpenseSplit rows, not part of settlement.
      t.integer    :split_strategy, null: false, default: 0  # equal/percentage/custom/none
      # External (non-member) participants, attributed to one existing member
      # who "承担 N+1 人份" in the split.
      t.integer    :external_count, null: false, default: 0
      t.references :external_attributed_to, foreign_key: { to_table: :users }
      t.string     :note, limit: 280
      t.date       :occurred_on
      t.timestamps

      t.index [ :tour_id, :activity_id ]
      t.index [ :tour_id, :day_id ]
      t.index [ :tour_id, :paid_by_id ]
    end
  end
end
