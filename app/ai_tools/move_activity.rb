module AITools
  class MoveActivity < AITools::Base
    description "把一条 activity 移到指定日和位置；to_day_index 为 'backlog' 则移入 backlog"
  
    param :activity_id,  type: :integer
    param :to_day_index, desc: "目标 day_index 或 'backlog'"
    param :to_position,  type: :integer
  
    def execute(activity_id:, to_day_index:, to_position:)
      activity = Activity.find_by(id: activity_id)
      return fail("Activity not found", code: "activity_not_found") unless activity
  
      target_day =
        if to_day_index.to_s == "backlog"
          nil
        else
          activity.tour.reload.days.find_by(day_index: to_day_index.to_i)
        end
      return fail("Day not found", code: "day_not_found") if to_day_index.to_s != "backlog" && target_day.nil?
  
      Activity.transaction do
        activity.update!(day: target_day, position: to_position)
      end
      ok(activity_id: activity.id, day_id: activity.day_id, position: activity.position)
    end
  end
end
