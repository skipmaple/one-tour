class DropGuidebooksAndMemberships < ActiveRecord::Migration[8.0]
  def up
    execute "DELETE FROM active_storage_attachments WHERE record_type = 'Guidebook'"
    drop_table :guidebook_memberships
    drop_table :guidebooks
  end

  def down
    raise ActiveRecord::IrreversibleMigration
  end
end
