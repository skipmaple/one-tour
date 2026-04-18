class AddCurrencyAndTimezoneToTours < ActiveRecord::Migration[8.0]
  def change
    add_column :tours, :currency, :string, limit: 3, default: "CNY", null: false
    add_column :tours, :timezone, :string, default: "Asia/Shanghai", null: false
  end
end
