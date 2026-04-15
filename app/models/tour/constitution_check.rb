class Tour::ConstitutionCheck
  Violation = Struct.new(:level, :rule, :scope, :message, :suggestion, keyword_init: true)

  def self.for(tour)
    new(tour).violations
  end

  def initialize(tour)
    @tour  = tour
    @rules = tour.constitution.deep_symbolize_keys
  end

  def violations
    [
      check_daily_driving
    ].flatten.compact.reject { |v| overridden?(v) }
  end

  private
    def check_daily_driving
      limit = @rules[:max_daily_driving_minutes]
      @tour.days.map do |day|
        total = day.driving_minutes_total
        next if total <= limit
        Violation.new(
          level: :hard,
          rule: :max_daily_driving_minutes,
          scope: { day_index: day.day_index },
          message: "D#{day.day_index} 驾驶 #{total} min > #{limit} min 上限",
          suggestion: "考虑把部分行程拆到相邻日"
        )
      end
    end

    def overridden?(violation)
      @tour.constraint_overrides.any? { |o| same_scope?(o, violation) }
    end

    def same_scope?(override, violation)
      override["rule"].to_s == violation.rule.to_s &&
        (override["scope"] || {}).deep_symbolize_keys == (violation.scope || {})
    end
end
