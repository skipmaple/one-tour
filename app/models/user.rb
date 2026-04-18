class User < ApplicationRecord
  has_one_attached :avatar

  has_many :oauth_identities, dependent: :destroy
  has_many :guidebooks, foreign_key: :author_id, dependent: :destroy
  has_many :guidebook_memberships, dependent: :destroy
  has_many :conversations, dependent: :destroy

  validates :name, presence: true,
                   length: { maximum: 30 },
                   format: {
                     with: /\A[A-Za-z0-9\u4e00-\u9fff]+\z/,
                     message: "只能包含字母、数字或中文"
                   }
  validates :email, presence: true, uniqueness: true
  validate :avatar_format_and_size, if: -> { avatar.attached? }

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

  private
    def avatar_format_and_size
      unless %w[image/jpeg image/png image/webp].include?(avatar.content_type)
        errors.add(:avatar, "格式不支持")
      end
      if avatar.byte_size > 5.megabytes
        errors.add(:avatar, "不能超过 5MB")
      end
    end
end
