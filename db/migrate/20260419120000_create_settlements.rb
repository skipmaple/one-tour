class CreateSettlements < ActiveRecord::Migration[8.0]
  def change
    create_table :settlements do |t|
      t.references :tour,        null: false, foreign_key: true
      t.references :from_user,   null: false, foreign_key: { to_table: :users }
      t.references :to_user,     null: false, foreign_key: { to_table: :users }
      t.references :recorded_by, null: false, foreign_key: { to_table: :users }
      t.integer    :amount_cents, null: false
      t.datetime   :settled_at,  null: false
      t.string     :note,        limit: 140
      t.timestamps

      t.index [ :tour_id, :from_user_id ]
      t.index [ :tour_id, :to_user_id ]
    end
  end
end
