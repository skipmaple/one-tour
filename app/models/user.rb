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
      if avatar.byte_size > 5.megabytes
        errors.add(:avatar, "不能超过 5MB")
      else
        detected = avatar_mime_type
        if %w[image/jpeg image/png image/webp].exclude?(detected)
          errors.add(:avatar, "格式不支持")
        end
      end
    end

    def avatar_mime_type
      # Before the file is uploaded to the service (e.g. during validation with
      # transactional fixtures), attachment_changes holds the pending CreateOne
      # change whose attachable still carries the raw IO. Read from that IO
      # directly — without passing the client-declared content_type — so magic
      # bytes alone determine the detected type and spoofed headers are rejected.
      #
      # Attachable shapes:
      #   Hash     (io:, filename:, content_type:) — from direct attach calls
      #   Rack::Test::UploadedFile / ActionDispatch::Http::UploadedFile — from
      #     controller params; both expose .open or respond to read
      #
      # After commit (no pending change), fall back to avatar.download.
      change = attachment_changes["avatar"]
      io = case change&.attachable
      when Hash
        a = change.attachable
        a[:io].tap(&:rewind)
      when ->(a) { a.respond_to?(:open) }
        change.attachable.open
      end

      if io
        Marcel::MimeType.for(io)
      else
        Marcel::MimeType.for(StringIO.new(avatar.download))
      end
    end
end
