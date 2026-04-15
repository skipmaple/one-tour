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
end
