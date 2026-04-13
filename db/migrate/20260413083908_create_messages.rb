class CreateMessages < ActiveRecord::Migration[8.0]
  def change
    create_table :messages do |t|
      t.references :conversation, null: false, foreign_key: true
      t.integer :role, null: false
      t.text :content
      t.jsonb :tool_calls
      t.jsonb :metadata

      t.timestamps
    end
  end
end
