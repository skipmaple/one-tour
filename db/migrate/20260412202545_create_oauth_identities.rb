class CreateOauthIdentities < ActiveRecord::Migration[8.0]
  def change
    create_table :oauth_identities do |t|
      t.references :user, null: false, foreign_key: true
      t.string :provider, null: false
      t.string :uid, null: false
      t.jsonb :credentials, default: {}

      t.timestamps
    end

    add_index :oauth_identities, [:provider, :uid], unique: true
  end
end
