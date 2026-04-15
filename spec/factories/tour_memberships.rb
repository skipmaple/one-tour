FactoryBot.define do
  factory :tour_membership do
    tour
    user
    role { :reader }
  end
end
