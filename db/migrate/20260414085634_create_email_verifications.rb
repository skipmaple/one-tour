class CreateEmailVerifications < ActiveRecord::Migration[8.0]
  def change
    create_table :email_verifications do |t|
      t.string   :email,       null: false
      t.string   :code_digest, null: false
      t.datetime :expires_at,  null: false
      t.integer  :attempts,    null: false, default: 0
      t.datetime :used_at
      t.string   :requested_ip
      t.timestamps
    end
    add_index :email_verifications, :email
    add_index :email_verifications, [ :email, :created_at ]
    add_index :email_verifications, :requested_ip
  end
end
