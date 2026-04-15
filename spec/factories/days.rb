FactoryBot.define do
  factory :day do
    tour
    sequence(:day_index) { |n| n }
    title { "Day #{day_index}" }
    intensity { :green }
  end
end
