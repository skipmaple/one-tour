class CreateActivities < ActiveRecord::Migration[8.0]
  def change
    create_table :activities do |t|
      t.references :tour, null: false, foreign_key: true
      t.references :day, null: true, foreign_key: true
      t.integer :position, null: false

      t.integer :citizen_level, null: false, default: 2   # tier_one=0, tier_two=1, tier_three=2, infrastructure=3
      t.integer :kind, null: false                         # scenic=0, road=1, food=2, stay=3, fuel=4, other=5

      t.string  :name, null: false
      t.decimal :lat, precision: 9, scale: 6
      t.decimal :lng, precision: 9, scale: 6
      t.string  :address

      t.time    :planned_start_at
      t.integer :planned_duration_min

      t.text    :desc
      t.text    :tips

      t.jsonb   :details, default: {}, null: false

      t.timestamps
      t.index [ :tour_id, :day_id, :position ]
      t.index [ :tour_id, :kind, :citizen_level ]
    end
  end
end
