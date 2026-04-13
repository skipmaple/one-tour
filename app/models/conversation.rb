class Conversation < ApplicationRecord
  belongs_to :guidebook
  belongs_to :user
  has_many :messages, dependent: :destroy

  validates :guidebook_id, uniqueness: { scope: :user_id }
end
