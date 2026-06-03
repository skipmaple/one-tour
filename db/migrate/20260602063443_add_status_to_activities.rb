class AddStatusToActivities < ActiveRecord::Migration[8.0]
  def change
    add_column :activities, :status, :integer, default: 0, null: false
    add_index  :activities, :status
  end
end
