# Seeds: intentionally empty after Tour remodel. Add Tour seeds when needed.

if Rails.env.development?
  User.first&.update!(role: :admin)
end
