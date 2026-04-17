class AddConstitutionAcceptedToTours < ActiveRecord::Migration[8.0]
  def change
    add_column :tours, :constitution_accepted, :boolean, default: false, null: false
  end
end
