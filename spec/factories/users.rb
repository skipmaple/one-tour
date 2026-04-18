FactoryBot.define do
  factory :user do
    sequence(:name) { |n| "TestUser#{n}" }
    sequence(:email) { |n| "user#{n}@example.com" }
  end
end
