class DropTipsFromActivities < ActiveRecord::Migration[8.0]
  def change
    remove_column :activities, :tips, :text
  end
end
