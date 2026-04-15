class PointConversationsToTour < ActiveRecord::Migration[8.0]
  def up
    execute "DELETE FROM messages"
    execute "DELETE FROM conversations"

    if column_exists?(:conversations, :guidebook_id)
      remove_reference :conversations, :guidebook, foreign_key: true
    end
    unless column_exists?(:conversations, :tour_id)
      add_reference :conversations, :tour, null: false, foreign_key: true
      add_index :conversations, [ :tour_id, :user_id ], unique: true, name: "index_conversations_on_tour_id_and_user_id"
    end
  end

  def down
    remove_reference :conversations, :tour, foreign_key: true
    add_reference :conversations, :guidebook, null: false, foreign_key: true
    add_index :conversations, [ :guidebook_id, :user_id ], unique: true
  end
end
