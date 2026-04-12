class GuidebookMembership < ApplicationRecord
  belongs_to :guidebook
  belongs_to :user

  enum :role, { reader: 0, editor: 1 }

  validates :user_id, uniqueness: { scope: :guidebook_id }
end
