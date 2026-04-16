class Day < ApplicationRecord
  belongs_to :tour
  has_many :activities, -> { order(:position) }, dependent: :nullify

  enum :intensity, green: 0, yellow: 1, red: 2

  validates :day_index, presence: true, uniqueness: { scope: :tour_id }

  def driving_minutes_total
    activities.where(kind: :road).sum("COALESCE((details->>'drive_min')::int, 0)")
  end

  def tier_one_count
    activities.where(citizen_level: :tier_one).count
  end

  # Derive intensity from current state (not stored). Takes pre-computed
  # violations from Tour::ConstitutionCheck to avoid N+1.
  # Rules (first match wins):
  #   - buffer_day=true           → :green
  #   - hard violation on this day → :red
  #   - driving < 120 min          → :green
  #   - driving <= 360 min         → :yellow
  #   - otherwise                  → :red
  def intensity_derived(violations = [])
    return :green if buffer_day?
    return :red   if hard_violation?(violations)

    total = driving_minutes_total
    if total < 120
      :green
    elsif total <= 360
      :yellow
    else
      :red
    end
  end

  private
    def hard_violation?(violations)
      violations.any? do |v|
        level = v[:level] || v["level"]
        scope = v[:scope] || v["scope"] || {}
        next false unless level.to_s == "hard"
        scope_day_index = scope[:day_index] || scope["day_index"]
        scope_day_index.to_i == day_index
      end
    end
end
