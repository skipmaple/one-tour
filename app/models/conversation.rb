class Conversation < ApplicationRecord
  belongs_to :tour
  belongs_to :user
  has_many :messages, dependent: :destroy

  validates :tour_id, uniqueness: { scope: :user_id }
end
