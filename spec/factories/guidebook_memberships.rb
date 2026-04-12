FactoryBot.define do
  factory :guidebook_membership do
    guidebook
    user
    role { :reader }
  end
end
