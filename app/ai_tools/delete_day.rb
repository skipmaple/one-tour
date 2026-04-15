module AITools
  class DeleteDay < AITools::Base
    description "删除一天。该日下的 activity 自动移到 backlog。"
    param :day_id, type: :integer
  
    def execute(day_id:)
      day = Day.find_by(id: day_id)
      return fail("Day not found", code: "day_not_found") unless day
      day.destroy!
      ok(deleted_day_id: day_id)
    end
  end
end
