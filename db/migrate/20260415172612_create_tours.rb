class CreateTours < ActiveRecord::Migration[8.0]
  def change
    create_table :tours do |t|
      t.references :author, null: false, foreign_key: { to_table: :users }
      t.string  :title, null: false
      t.string  :date_range
      t.string  :vehicle
      t.integer :team_size
      t.string  :trip_style
      t.string  :budget_per_person
      t.jsonb   :constitution, default: {}, null: false
      t.jsonb   :constraint_overrides, default: [], null: false
      t.boolean :archived, default: false, null: false
      t.timestamps
    end
  end
end
