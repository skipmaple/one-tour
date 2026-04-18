class SanitizeExistingUserNames < ActiveRecord::Migration[8.0]
  def up
    User.reset_column_information
    User.find_each do |u|
      clean = u.name.to_s.gsub(/[^A-Za-z0-9\u4e00-\u9fff]/, "")[0, 30]
      clean = "user#{u.id}" if clean.empty?
      u.update_columns(name: clean) if clean != u.name
    end
  end

  def down
    # Irreversible — original names are not recoverable.
  end
end
