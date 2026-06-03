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
      check_daily_driving,
      check_tier_one_per_day,
      check_buffer_days,
      check_tier_two_food
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

    def check_tier_one_per_day
      limit = @rules[:max_tier_one_per_day]
      @tour.days.map do |day|
        count = day.tier_one_count
        next if count <= limit
        Violation.new(
          level: :hard,
          rule: :max_tier_one_per_day,
          scope: { day_index: day.day_index },
          message: "D#{day.day_index} 一等公民 #{count} 个（超过每日 #{limit} 上限）",
          suggestion: "拆到其他日或降级为二等/三等"
        )
      end
    end

    def check_buffer_days
      return nil if @tour.activities.empty?
      limit = @rules[:min_buffer_days]
      actual = @tour.buffer_days_count
      return nil if actual >= limit
      Violation.new(
        level: :soft,
        rule: :min_buffer_days,
        scope: {},
        message: "整程 #{actual} 个机动日（建议 ≥ #{limit}）",
        suggestion: "新增一个 buffer_day=true 的 Day"
      )
    end

    def check_tier_two_food
      limit = @rules[:max_tier_two_food_per_tour]
      count = @tour.tier_two_food_count
      return nil if count <= limit
      Violation.new(
        level: :soft,
        rule: :max_tier_two_food_per_tour,
        scope: {},
        message: "整程二等餐厅 #{count} 家（上限 #{limit}）",
        suggestion: "降级部分餐厅到三等"
      )
    end

    def overridden?(violation)
      @tour.constraint_overrides.any? { |o| same_scope?(o, violation) }
    end

    def same_scope?(override, violation)
      override["rule"].to_s == violation.rule.to_s &&
        (override["scope"] || {}).deep_symbolize_keys == (violation.scope || {})
    end
end
