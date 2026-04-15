module AITools
  class ReorderDay < AITools::Base
    description "按给定 activity_ids 顺序重排一个 Day"
    param :day_id,        type: :integer
    param :activity_ids,  type: :array, desc: "activity id 列表（决定新 position 顺序）"

    def execute(day_id:, activity_ids:)
      with_rescues do
        day = Day.find_by(id: day_id)
        next bail("Day not found", code: "day_not_found") unless day

        updated = 0
        Activity.transaction do
          activity_ids.each_with_index do |aid, idx|
            activity = day.activities.find_by(id: aid)
            next unless activity
            activity.update!(position: idx + 1)
            updated += 1
          end
        end
        ok(day_id: day_id, count: updated)
      end
    end
  end
end
