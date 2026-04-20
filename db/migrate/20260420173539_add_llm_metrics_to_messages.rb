class AddLlmMetricsToMessages < ActiveRecord::Migration[8.0]
  def change
    add_column :messages, :tokens_in,   :integer
    add_column :messages, :tokens_out,  :integer
    add_column :messages, :cost_cents,  :integer
    add_index  :messages, :created_at
  end
end
