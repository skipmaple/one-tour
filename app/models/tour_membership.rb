class TourMembership < ApplicationRecord
  belongs_to :tour
  belongs_to :user

  enum :role, reader: 0, editor: 1

  validates :user_id, uniqueness: { scope: :tour_id, message: "already a member of this tour" }
  validate :participating_day_ids_belong_to_tour

  # Days this member participates in. Empty array = 全程参与 (backward-compatible
  # default). Used by the "按参与天数" splitting strategy — expenses on days not
  # in this set don't get assigned to this member.
  def participates_in_day?(day_id)
    ids = participating_day_ids
    ids.blank? || ids.map(&:to_i).include?(day_id.to_i)
  end

  private
    def participating_day_ids_belong_to_tour
      return if participating_day_ids.blank?

      valid_ids = tour.days.pluck(:id).map(&:to_i).to_set
      invalid = participating_day_ids.map(&:to_i).reject { |id| valid_ids.include?(id) }
      if invalid.any?
        errors.add(:participating_day_ids, "包含不属于本行程的日期 #{invalid.join(', ')}")
      end
    end
end
