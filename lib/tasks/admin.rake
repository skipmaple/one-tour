namespace :admin do
  desc "Grant admin role: rake admin:grant EMAIL=x@y.com"
  task grant: :environment do
    email = ENV.fetch("EMAIL")
    user = User.find_by!(email: email)
    user.update!(role: :admin)
    puts "✔ #{user.email} → admin"
  end

  desc "Revoke admin role: rake admin:revoke EMAIL=x@y.com"
  task revoke: :environment do
    email = ENV.fetch("EMAIL")
    user = User.find_by!(email: email)
    user.update!(role: :user)
    puts "✔ #{user.email} → user"
  end
end
