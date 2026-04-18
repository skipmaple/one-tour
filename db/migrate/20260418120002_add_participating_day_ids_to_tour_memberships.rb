class AddParticipatingDayIdsToTourMemberships < ActiveRecord::Migration[8.0]
  def change
    # Empty array = "全程参与" (backward-compatible default for existing rows).
    # Non-empty = the specific day_ids this member participates in; the "按参与天数"
    # splitting strategy reads this field.
    add_column :tour_memberships, :participating_day_ids, :jsonb, default: [], null: false
  end
end
