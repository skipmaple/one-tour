class ExpenseReceipt < ApplicationRecord
  MAX_PER_EXPENSE = 3
  MAX_FILE_SIZE = 5.megabytes
  ALLOWED_CONTENT_TYPES = %w[image/jpeg image/jpg image/png image/webp].freeze

  belongs_to :expense
  belongs_to :uploaded_by, class_name: "User"

  has_one_attached :file

  validate :file_attached
  validate :file_content_type
  validate :file_byte_size
  validate :per_expense_limit, on: :create

  scope :ordered, -> { order(:position) }

  private
    def file_attached
      unless file.attached?
        errors.add(:file, "请选择一张收据")
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
        errors.add(:file, "大小超过 5 MB")
      end
    end

    def per_expense_limit
      return unless expense
      if expense.receipts.count >= MAX_PER_EXPENSE
        errors.add(:base, "每笔支出最多 #{MAX_PER_EXPENSE} 张收据")
      end
    end
end
