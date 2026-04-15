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
    [].flatten.compact.reject { |v| overridden?(v) }
  end

  private
    def overridden?(violation)
      @tour.constraint_overrides.any? { |o| same_scope?(o, violation) }
    end

    def same_scope?(override, violation)
      override["rule"].to_s == violation.rule.to_s &&
        (override["scope"] || {}).deep_symbolize_keys == (violation.scope || {})
    end
end
