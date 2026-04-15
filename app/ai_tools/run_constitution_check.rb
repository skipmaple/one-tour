module AITools
  class RunConstitutionCheck < AITools::Base
    description "对某 Tour 跑一次宪法校验，返回违反列表"
    param :tour_id, type: :integer
  
    def execute(tour_id:)
      tour = Tour.find_by(id: tour_id)
      return fail("Tour not found", code: "tour_not_found") unless tour
      violations = Tour::ConstitutionCheck.for(tour).map do |v|
        { level: v.level, rule: v.rule, scope: v.scope, message: v.message, suggestion: v.suggestion }
      end
      ok(violations: violations)
    end
  end
end
