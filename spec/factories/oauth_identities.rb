FactoryBot.define do
  factory :oauth_identity do
    user
    provider { "github" }
    sequence(:uid) { |n| "uid_#{n}" }
    credentials { {access_token: "test_token"} }
  end
end
