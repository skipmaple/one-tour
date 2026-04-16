class Activity < ApplicationRecord
  DETAILS_MAX_BYTES = 10_000

  belongs_to :tour
  belongs_to :day, optional: true

  enum :kind, scenic: 0, road: 1, food: 2, stay: 3, fuel: 4, other: 5
  enum :citizen_level, tier_one: 0, tier_two: 1, tier_three: 2, infrastructure: 3

  validates :name, presence: true
  validates :position, presence: true
  validate  :details_is_hash
  validate  :details_size_within_limit

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

  private
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
end
