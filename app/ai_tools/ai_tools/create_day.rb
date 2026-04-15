module AITools
  class CreateDay < Base
    description "向 Tour 新增一天"
    param :tour_id,     type: :integer
    param :day_index,   type: :integer
    param :title,       type: :string, required: false
    param :date,        type: :string, required: false
    param :buffer_day,  type: :boolean, required: false

    def execute(tour_id:, day_index:, title: nil, date: nil, buffer_day: false)
      tour = Tour.find_by(id: tour_id)
      return fail("Tour not found", code: "tour_not_found") unless tour
      day = tour.days.create!(
        day_index: day_index, title: title, date: date, buffer_day: buffer_day
      )
      ok(day_id: day.id)
    rescue ActiveRecord::RecordInvalid => e
      fail(e.message, code: "validation")
    end
  end
end
