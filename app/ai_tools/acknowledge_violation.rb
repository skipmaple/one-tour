module AITools
  class AcknowledgeViolation < AITools::Base
    description "承认一条宪法违反，写入 constraint_overrides"
    param :rule,    type: :string
    param :scope,   type: :object, required: false
    param :reason,  type: :string

    def execute(rule:, reason:, scope: {})
      with_rescues do
        next require_tour! if @tour.nil?

        @tour.record_override!(rule: rule, scope: scope || {}, reason: reason)
        ok(overrides_count: @tour.constraint_overrides.size)
      end
    end
  end
end
