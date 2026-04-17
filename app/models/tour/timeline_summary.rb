class Tour::TimelineSummary
  def self.for(tour)
    new(tour).to_h
  end

  def initialize(tour)
    @tour       = tour
    @violations = Tour::ConstitutionCheck.for(tour)
  end

  def to_h
    {
      day_count:       @tour.days.count,
      activity_count:  @tour.activities.count,
      tier_one_total:  @tour.activities.where(citizen_level: :tier_one).count,
      tier_one_limit:  @tour.constitution["max_tier_one_per_day"],
      buffer_count:    @tour.buffer_days_count,
      buffer_min:      @tour.constitution["min_buffer_days"],
      hard_count:      @violations.count { |v| v.level == :hard },
      soft_count:      @violations.count { |v| v.level == :soft }
    }
  end
end
