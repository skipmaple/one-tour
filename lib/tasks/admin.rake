namespace :admin do
  def fetch_email_or_abort(task_name)
    email = ENV["EMAIL"].to_s.strip
    return email unless email.empty?
    abort <<~MSG
      error: EMAIL is required.
      usage: rake #{task_name} EMAIL=user@example.com
    MSG
  end

  desc "Grant admin role: rake admin:grant EMAIL=x@y.com"
  task grant: :environment do
    email = fetch_email_or_abort("admin:grant")
    user = User.find_by!(email: email)
    user.update!(role: :admin)
    puts "✔ #{user.email} → admin"
  end

  desc "Revoke admin role: rake admin:revoke EMAIL=x@y.com"
  task revoke: :environment do
    email = fetch_email_or_abort("admin:revoke")
    user = User.find_by!(email: email)
    user.update!(role: :user)
    puts "✔ #{user.email} → user"
  end
end
