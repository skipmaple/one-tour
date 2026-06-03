class ChangeActivitiesCitizenLevelDefault < ActiveRecord::Migration[8.0]
  def up
    change_column_default :activities, :citizen_level, from: 2, to: 1
  end

  def down
    change_column_default :activities, :citizen_level, from: 1, to: 2
  end
end
