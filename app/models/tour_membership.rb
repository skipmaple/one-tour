class TourMembership < ApplicationRecord
  belongs_to :tour
  belongs_to :user

  enum :role, reader: 0, editor: 1
end
