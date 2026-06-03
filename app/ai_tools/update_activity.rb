module AITools
  class UpdateActivity < AITools::Base
    description "更新某条 activity 的字段（部分更新）"
    param :activity_id, type: :integer
    param :patch,       type: :object, desc: "要更新的字段 hash（name/desc/lat/lng/planned_start_at/planned_duration_min/details…）"

    UPDATABLE = %w[name desc lat lng address planned_start_at planned_duration_min kind citizen_level status details].freeze

    def execute(activity_id:, patch:)
      with_rescues do
        next require_tour! if @tour.nil?

        activity = @tour.activities.find_by(id: activity_id)
        next bail("Activity not found", code: "activity_not_found") unless activity

        safe = (patch || {}).stringify_keys.slice(*UPDATABLE)
        activity.update!(safe)
        ok(activity_id: activity.id, updated_fields: safe.keys)
      end
    end
  end
end
