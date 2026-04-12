FactoryBot.define do
  factory :guidebook do
    title { "Test Guidebook" }
    content { "---\ntitle: Test Guidebook\ndays: []\n---\n\n# Test" }
    author factory: :user
    published { false }
  end
end
