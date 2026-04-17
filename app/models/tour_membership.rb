class TourMembership < ApplicationRecord
  belongs_to :tour
  belongs_to :user

  enum :role, reader: 0, editor: 1

  validates :user_id, uniqueness: { scope: :tour_id, message: "already a member of this tour" }
end
