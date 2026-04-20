class ActivityParticipant < ApplicationRecord
  belongs_to :activity
  belongs_to :user

  validates :user_id, uniqueness: { scope: :activity_id }
  validate  :user_belongs_to_tour

  private
    def user_belongs_to_tour
      tour = activity&.tour
      return unless tour && user_id

      allowed = [ tour.author_id, *tour.tour_memberships.pluck(:user_id) ]
      errors.add(:user_id, "不属于本行程成员") unless allowed.include?(user_id)
    end
end
