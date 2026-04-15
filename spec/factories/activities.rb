FactoryBot.define do
  factory :activity do
    tour
    day { nil }
    sequence(:position) { |n| n }
    sequence(:name) { |n| "Activity #{n}" }
    kind { :scenic }
    citizen_level { :tier_three }
  end
end
