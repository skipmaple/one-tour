class CreateGuidebooks < ActiveRecord::Migration[8.0]
  def change
    create_table :guidebooks do |t|
      t.string :title, null: false
      t.text :content, null: false, default: ""
      t.jsonb :frontmatter_cache, default: {}
      t.references :author, null: false, foreign_key: { to_table: :users }
      t.boolean :published, null: false, default: false

      t.timestamps
    end
  end
end
