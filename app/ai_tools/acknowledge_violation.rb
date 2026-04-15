module AITools
  class AcknowledgeViolation < AITools::Base
    description "承认一条宪法违反，写入 constraint_overrides"
    param :tour_id, type: :integer
    param :rule,    type: :string
    param :scope,   type: :object, required: false
    param :reason,  type: :string

    def execute(tour_id:, rule:, reason:, scope: {})
      tour = Tour.find_by(id: tour_id)
      return fail("Tour not found", code: "tour_not_found") unless tour

      overrides = Array(tour.constraint_overrides) + [ {
        "rule"            => rule.to_s,
        "scope"           => (scope || {}).stringify_keys,
        "reason"          => reason,
        "acknowledged_at" => Time.current.iso8601
      } ]
      tour.update!(constraint_overrides: overrides)
      ok(overrides_count: overrides.size)
    end
  end
end
