class CreateTourMemberships < ActiveRecord::Migration[8.0]
  def change
    create_table :tour_memberships do |t|
      t.references :tour, null: false, foreign_key: true
      t.references :user, null: false, foreign_key: true
      t.integer    :role, default: 0, null: false  # reader=0, editor=1
      t.timestamps
      t.index [ :tour_id, :user_id ], unique: true
    end
  end
end
