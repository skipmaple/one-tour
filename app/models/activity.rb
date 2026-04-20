class Activity < ApplicationRecord
  DETAILS_MAX_BYTES = 10_000

  # Non-negative numeric detail fields — kept in sync with the frontend
  # detailsSchema (`type: 'number_with_suffix'`) so the server rejects
  # out-of-range values even if the UI is bypassed.
  DETAILS_NUMERIC_FIELDS = %w[
    altitude recommend_stay_min ticket_info price_pp km drive_min next_station_km
  ].freeze
  # Upper bounds for specific numeric fields (min is always 0 for any field
  # listed above). Mirrors `max` in detailsSchema.
  DETAILS_MAX_BOUNDS = { "altitude" => 9000 }.freeze

  belongs_to :tour
  belongs_to :day, optional: true
  has_many :activity_images, -> { order(:position) }, dependent: :destroy
  has_many :expenses, dependent: :destroy
  has_many :tour_budgets, dependent: :destroy
  has_many :activity_participants, dependent: :destroy
  has_many :participants, through: :activity_participants, source: :user

  # When an activity moves to a different day (or goes to backlog), propagate the
  # new day_id to all its activity-scope expenses so the daily aggregation stays
  # consistent without joining activities in every query.
  after_update :sync_expense_days, if: :saved_change_to_day_id?

  enum :kind, scenic: 0, road: 1, food: 2, stay: 3, fuel: 4, other: 5
  enum :citizen_level, tier_one: 0, tier_two: 1, tier_three: 2, infrastructure: 3

  validates :name, presence: true
  validates :position, presence: true
  validate  :details_is_hash
  validate  :details_size_within_limit
  validate  :details_numeric_bounds

  # Override default `as_json` so the `time`-typed `planned_start_at` column
  # serializes as an `HH:MM` string instead of Rails' default ISO 8601 datetime
  # (`2000-01-01T14:30:00.000Z`). The frontend (Planner cards, Timeline cards,
  # ActivityDrawer time input, DayDetailPanel parseHour) all expect HH:MM.
  def as_json(options = nil)
    super.tap do |hash|
      if hash.key?("planned_start_at") && planned_start_at.present?
        hash["planned_start_at"] = planned_start_at.strftime("%H:%M")
      end
    end
  end

  def effective_participant_ids
    explicit = activity_participants.pluck(:user_id)
    return explicit if explicit.any?
    [ tour.author_id, *tour.tour_memberships.pluck(:user_id) ]
  end

  private
    def sync_expense_days
      expenses.activity.update_all(day_id: day_id)
    end

    def details_is_hash
      return if details.nil? || details.is_a?(Hash)
      errors.add(:details, "must be a JSON object")
    end

    def details_size_within_limit
      return if details.blank?
      if details.to_json.bytesize > DETAILS_MAX_BYTES
        errors.add(:details, "is too large (max #{DETAILS_MAX_BYTES} bytes)")
      end
    end

    def details_numeric_bounds
      return if details.blank? || !details.is_a?(Hash)
      DETAILS_NUMERIC_FIELDS.each do |key|
        next unless details.key?(key)
        val = details[key]
        next if val.nil?
        unless val.is_a?(Numeric)
          errors.add(:details, "#{key} 必须为数字")
          next
        end
        if val < 0
          errors.add(:details, "#{key} 不能为负数")
        end
        max = DETAILS_MAX_BOUNDS[key]
        if max && val > max
          errors.add(:details, "#{key} 不能超过 #{max}")
        end
      end
    end
end
