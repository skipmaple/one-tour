class AddOverrideToRouteLegs < ActiveRecord::Migration[8.0]
  def change
    add_column :route_legs, :distance_m_override, :integer
    add_column :route_legs, :duration_s_override, :integer
    add_column :route_legs, :note, :text
    add_column :route_legs, :overridden_at, :datetime
    add_reference :route_legs, :overridden_by,
                  foreign_key: { to_table: :users, on_delete: :nullify }
  end
end
