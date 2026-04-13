FactoryBot.define do
  factory :message do
    conversation
    role { :user }
    content { "Hello" }
  end
end
