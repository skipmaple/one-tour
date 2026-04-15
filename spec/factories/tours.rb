FactoryBot.define do
  factory :tour do
    sequence(:title) { |n| "Tour #{n}" }
    association :author, factory: :user
  end
end
