class CreateGuidebookMemberships < ActiveRecord::Migration[8.0]
  def change
    create_table :guidebook_memberships do |t|
      t.references :guidebook, null: false, foreign_key: true
      t.references :user, null: false, foreign_key: true
      t.integer :role, null: false, default: 0

      t.timestamps
    end

    add_index :guidebook_memberships, [:guidebook_id, :user_id], unique: true
  end
end
