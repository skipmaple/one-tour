FactoryBot.define do
  factory :activity do
    tour
    day { nil }
    sequence(:position) { |n| n }
    sequence(:name) { |n| "Activity #{n}" }
    kind { :scenic }
    citizen_level { :tier_three }

    trait :scenic_road do
      kind { :road }
      citizen_level { :tier_one }
      details do
        {
          "start_lat" => 42.9, "start_lng" => 83.5, "start_name" => "南入口",
          "end_lat"   => 44.0, "end_lng"   => 84.7, "end_name"   => "北出口",
          "km" => 120, "drive_min" => 180
        }
      end
    end
  end
end
