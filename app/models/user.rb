class User < ApplicationRecord
  has_one_attached :avatar

  has_many :oauth_identities, dependent: :destroy
  has_many :guidebooks, foreign_key: :author_id, dependent: :destroy
  has_many :guidebook_memberships, dependent: :destroy
  has_many :conversations, dependent: :destroy

  validates :name, presence: true
  validates :email, presence: true, uniqueness: true

  def display_avatar_url
    if avatar.attached?
      Rails.application.routes.url_helpers.rails_representation_url(
        avatar.variant(resize_to_limit: [ 512, 512 ]),
        only_path: true
      )
    else
      avatar_url
    end
  end

  def has_custom_avatar?
    avatar.attached?
  end
end
