module AITools
  class DeleteActivity < AITools::Base
    description "删除一条 activity"
    param :activity_id, type: :integer

    def execute(activity_id:)
      with_rescues do
        activity = Activity.find_by(id: activity_id)
        next bail("Activity not found", code: "activity_not_found") unless activity
        activity.destroy!
        ok(deleted_activity_id: activity_id)
      end
    end
  end
end
