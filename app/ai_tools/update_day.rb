module AITools
  class UpdateDay < AITools::Base
    description "更新 Day 元数据"
    param :day_id, type: :integer
    param :patch,  type: :object

    UPDATABLE = %w[title theme intensity buffer_day date].freeze

    def execute(day_id:, patch:)
      with_rescues do
        next require_tour! if @tour.nil?
        day = @tour.days.find_by(id: day_id)
        next bail("Day not found", code: "day_not_found") unless day
        safe = (patch || {}).stringify_keys.slice(*UPDATABLE)
        day.update!(safe)
        ok(day_id: day_id, updated_fields: safe.keys)
      end
    end
  end
end
