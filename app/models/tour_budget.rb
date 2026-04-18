class TourBudget < ApplicationRecord
  belongs_to :tour
  belongs_to :day,      optional: true
  belongs_to :activity, optional: true
  belongs_to :user

  validates :amount_cents, presence: true
  validate  :consistent_scope
  validate  :activity_in_tour_and_not_backlog
  validate  :day_in_tour

  # Scope is derived from presence of day/activity.
  def scope
    if activity_id.present?
      :activity
    elsif day_id.present?
      :day
    else
      :tour
    end
  end

  private
    # Only one of (activity_id, day_id) may be set at the same time. If activity_id
    # is set, day_id must be NULL (we read the day via activity.day_id at query time
    # to avoid sync complexity across moves).
    def consistent_scope
      if activity_id.present? && day_id.present?
        errors.add(:base, "预算适用范围冲突：同时设置了活动和日期")
      end
    end

    def activity_in_tour_and_not_backlog
      return if activity.nil?
      if activity.tour_id != tour_id
        errors.add(:activity_id, "不属于本行程")
      end
      if activity.day_id.nil?
        errors.add(:activity_id, "是候选池活动，不能设预算")
      end
    end

    def day_in_tour
      return if day.nil?
      if day.tour_id != tour_id
        errors.add(:day_id, "不属于本行程")
      end
    end
end
