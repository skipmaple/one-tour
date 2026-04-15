module AITools
  class DeleteDay < AITools::Base
    description "删除一天。该日下的 activity 自动移到 backlog。"
    param :day_id, type: :integer

    def execute(day_id:)
      with_rescues do
        next require_tour! if @tour.nil?
        day = @tour.days.find_by(id: day_id)
        next bail("Day not found", code: "day_not_found") unless day
        day.destroy!
        ok(deleted_day_id: day_id)
      end
    end
  end
end
