FactoryBot.define do
  factory :activity_participant do
    activity
    user

    # When used with `create(:activity_participant, activity: some_activity)`,
    # the default factory generates a fresh User that is NOT in the tour. The
    # model validator rejects this — callers should either add the user to
    # the tour first, or pass an explicit `user:` already in the membership set.
  end
end
