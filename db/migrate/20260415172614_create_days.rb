class CreateDays < ActiveRecord::Migration[8.0]
  def change
    create_table :days do |t|
      t.references :tour, null: false, foreign_key: true
      t.integer :day_index, null: false
      t.date    :date
      t.string  :title
      t.text    :theme
      t.integer :intensity  # green=0, yellow=1, red=2
      t.boolean :buffer_day, default: false, null: false
      t.timestamps
      t.index [ :tour_id, :day_index ], unique: true
    end
  end
end
