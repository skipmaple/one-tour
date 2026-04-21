class TourMembership < ApplicationRecord
  belongs_to :tour
  belongs_to :user

  enum :role, reader: 0, editor: 1

  validates :user_id, uniqueness: { scope: :tour_id, message: "already a member of this tour" }

  after_destroy :cleanup_activity_participants

  private
    def cleanup_activity_participants
      ActivityParticipant
        .joins(:activity)
        .where(user_id: user_id, activities: { tour_id: tour_id })
        .delete_all
    end
end
