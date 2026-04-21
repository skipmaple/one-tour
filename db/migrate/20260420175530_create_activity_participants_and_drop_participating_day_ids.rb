class CreateActivityParticipantsAndDropParticipatingDayIds < ActiveRecord::Migration[8.0]
  def change
    create_table :activity_participants do |t|
      t.references :activity, null: false, foreign_key: true, index: true
      t.references :user,     null: false, foreign_key: true, index: true
      t.timestamps
    end
    add_index :activity_participants, [ :activity_id, :user_id ], unique: true

    remove_column :tour_memberships, :participating_day_ids, :jsonb, default: [], null: false
  end
end
