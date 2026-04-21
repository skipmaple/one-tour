FactoryBot.define do
  factory :activity_participant do
    activity
    user { activity.tour.author }

    # Default `user` = the activity's tour author so `create(:activity_participant)`
    # builds a row that actually satisfies the tour-membership validator. When a
    # caller needs a different user they must pass `user:` AND ensure the user
    # is a TourMembership on the same tour (or is the author).
  end
end
