class Expense < ApplicationRecord
  belongs_to :tour
  belongs_to :activity, optional: true
  belongs_to :day,      optional: true
  belongs_to :paid_by,  class_name: "User"
  belongs_to :created_by, class_name: "User"
  belongs_to :external_attributed_to, class_name: "User", optional: true

  has_many :splits,   class_name: "ExpenseSplit",   dependent: :destroy
  has_many :receipts, class_name: "ExpenseReceipt", dependent: :destroy

  enum :scope,          activity: 0, day: 1, tour: 2
  enum :category,       food: 0, fuel: 1, lodging: 2, ticket: 3, refund: 4, misc: 5
  # `individual` is the "各付各" mode — no ExpenseSplit rows, not part of
  # settlement. Named `individual` (not `none`) to avoid clashing with
  # ActiveRecord::FinderMethods#none.
  enum :split_strategy, equal: 0, percentage: 1, custom: 2, individual: 3

  validates :amount_cents, presence: true
  validates :external_count, numericality: { greater_than_or_equal_to: 0 }
  validate  :scope_fields_consistent
  validate  :activity_in_tour
  validate  :day_in_tour
  validate  :activity_not_backlog
  validate  :external_attribution_requires_count

  # Auto-sync day_id from activity.day_id for activity-scope expenses so queries
  # and aggregations group by day without an extra JOIN. See Activity#sync_expense_days
  # for the reverse direction when activity.day_id changes.
  before_validation :sync_day_from_activity

  private
    def sync_day_from_activity
      if activity? && activity.present?
        self.day_id = activity.day_id
      elsif day? || tour?
        # leave day_id as-is (caller sets it for day-scope, or nil for tour-scope)
      end
    end

    # scope=activity → activity_id required, day_id = activity.day_id (auto)
    # scope=day      → day_id required, activity_id must be NULL
    # scope=tour     → both must be NULL
    def scope_fields_consistent
      case scope
      when "activity"
        errors.add(:activity_id, "必填") if activity_id.blank?
      when "day"
        errors.add(:day_id, "必填") if day_id.blank?
        errors.add(:activity_id, "日期级支出不应关联站点") if activity_id.present?
      when "tour"
        errors.add(:activity_id, "整程级支出不应关联站点") if activity_id.present?
        errors.add(:day_id, "整程级支出不应关联日期") if day_id.present?
      end
    end

    def activity_in_tour
      return if activity.nil?
      if activity.tour_id != tour_id
        errors.add(:activity_id, "不属于本行程")
      end
    end

    def day_in_tour
      return if day.nil?
      if day.tour_id != tour_id
        errors.add(:day_id, "不属于本行程")
      end
    end

    def activity_not_backlog
      if activity? && activity.present? && activity.day_id.nil?
        errors.add(:activity_id, "是候选池活动，请先排入某一天")
      end
    end

    def external_attribution_requires_count
      if external_count.to_i > 0 && external_attributed_to_id.blank?
        errors.add(:external_attributed_to_id, "含非成员时必须指定归属成员")
      end
      if external_attributed_to_id.present? && external_count.to_i == 0
        errors.add(:external_count, "指定了归属成员但人数为 0")
      end
    end
end
