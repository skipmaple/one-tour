class CreateActivityImages < ActiveRecord::Migration[8.0]
  def change
    create_table :activity_images do |t|
      t.references :activity, null: false, foreign_key: { on_delete: :cascade }
      t.references :uploaded_by, null: false, foreign_key: { to_table: :users }
      t.string :caption, limit: 280
      t.integer :position, null: false, default: 0
      t.boolean :is_cover, default: false, null: false
      t.timestamps

      t.index [ :activity_id, :position ]
      # At most one cover per activity (partial unique).
      t.index :activity_id,
              unique: true,
              where: "is_cover = true",
              name: "idx_activity_images_single_cover"
    end
  end
end
