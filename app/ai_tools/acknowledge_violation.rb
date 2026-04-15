module AITools
  class AcknowledgeViolation < AITools::Base
    description "承认一条宪法违反，写入 constraint_overrides"
    param :rule,    type: :string
    param :scope,   type: :object, required: false
    param :reason,  type: :string

    def execute(rule:, reason:, scope: {})
      with_rescues do
        next require_tour! if @tour.nil?

        new_entry = {
          "rule"            => rule.to_s,
          "scope"           => (scope || {}).stringify_keys,
          "reason"          => reason,
          "acknowledged_at" => Time.current.iso8601
        }
        existing = Array(@tour.constraint_overrides).reject do |o|
          o["rule"].to_s == new_entry["rule"] &&
            (o["scope"] || {}).stringify_keys == new_entry["scope"]
        end
        overrides = existing + [ new_entry ]
        @tour.update!(constraint_overrides: overrides)
        ok(overrides_count: overrides.size)
      end
    end
  end
end
