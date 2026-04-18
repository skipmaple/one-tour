class ActivityImage < ApplicationRecord
  MAX_PER_ACTIVITY = 20
  MAX_FILE_SIZE = 10.megabytes
  ALLOWED_CONTENT_TYPES = %w[image/jpeg image/jpg image/png image/webp image/gif].freeze

  belongs_to :activity
  belongs_to :uploaded_by, class_name: "User"

  has_one_attached :file

  validates :caption, length: { maximum: 280 }, allow_blank: true
  validate  :file_attached
  validate  :file_content_type
  validate  :file_byte_size
  validate  :per_activity_limit, on: :create

  scope :ordered, -> { order(:position) }

  # Sets this image as the cover, unsetting any existing cover on the same activity.
  # Wrapped in a transaction because the partial unique index would otherwise
  # raise on the brief window where two covers coexist.
  def mark_as_cover!
    return if is_cover?

    transaction do
      activity.activity_images.where(is_cover: true).where.not(id: id).update_all(is_cover: false)
      update!(is_cover: true)
    end
  end

  private
    def file_attached
      unless file.attached?
        errors.add(:file, "请选择一张图片")
      end
    end

    def file_content_type
      return unless file.attached?
      unless ALLOWED_CONTENT_TYPES.include?(file.content_type)
        errors.add(:file, "不支持的格式（#{file.content_type}）")
      end
    end

    def file_byte_size
      return unless file.attached?
      if file.blob.byte_size > MAX_FILE_SIZE
        errors.add(:file, "大小超过 10 MB")
      end
    end

    def per_activity_limit
      return unless activity
      if activity.activity_images.count >= MAX_PER_ACTIVITY
        errors.add(:base, "每个站点最多 #{MAX_PER_ACTIVITY} 张图片")
      end
    end
end
