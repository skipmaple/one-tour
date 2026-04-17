module AITools
  class RunConstitutionCheck < AITools::Base
    description "对当前 Tour 跑一次宪法校验，返回违反列表"

    def execute
      with_rescues do
        next require_tour! if @tour.nil?
        violations = Tour::ConstitutionCheck.for(@tour).map do |v|
          { level: v.level, rule: v.rule, scope: v.scope, message: v.message, suggestion: v.suggestion }
        end
        ok(violations: violations)
      end
    end
  end
end
