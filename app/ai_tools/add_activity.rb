module AITools
  class AddActivity < AITools::Base
    description "向 Tour 添加一条行（activity）。day_index 为 'backlog' 则放入 backlog，否则放入对应 Day。"
  
    param :tour_id,              type: :integer, desc: "Tour ID"
    param :day_index,            desc: "目标日的 day_index 整数，或 'backlog'"
    param :kind,                 desc: "scenic / road / food / stay / fuel / other"
    param :citizen_level,        desc: "tier_one / tier_two / tier_three / infrastructure"
    param :name,                 type: :string, desc: "活动名称"
    param :lat,                  type: :number, desc: "纬度", required: false
    param :lng,                  type: :number, desc: "经度", required: false
    param :planned_start_at,     type: :string, desc: "HH:MM", required: false
    param :planned_duration_min, type: :integer, required: false
    param :details,              type: :object, desc: "kind 对应的子类字段 hash", required: false
  
    def execute(tour_id:, day_index:, kind:, citizen_level:, name:, lat: nil, lng: nil,
                planned_start_at: nil, planned_duration_min: nil, details: {})
      tour = Tour.find_by(id: tour_id)
      return fail("Tour not found", code: "tour_not_found") unless tour
  
      day =
        if day_index.to_s == "backlog"
          nil
        else
          tour.days.find_by(day_index: day_index.to_i)
        end
      return fail("Day not found", code: "day_not_found") if day_index.to_s != "backlog" && day.nil?
  
      position = (day ? tour.activities.where(day_id: day.id).maximum(:position) : tour.activities.where(day_id: nil).maximum(:position)).to_i + 1
  
      activity = tour.activities.create!(
        day: day,
        position: position,
        kind: kind,
        citizen_level: citizen_level,
        name: name,
        lat: lat,
        lng: lng,
        planned_start_at: planned_start_at,
        planned_duration_min: planned_duration_min,
        details: details || {}
      )
  
      ok(activity_id: activity.id, position: activity.position)
    end
  end
end
