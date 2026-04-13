class GeocodeTool < RubyLLM::Tool
  description "将地点名称转为 GPS 坐标 [lat, lng]。当需要为旅行路书中的地点设置精确坐标时使用此工具。"

  param :place_name, desc: "地点名称，如 '乌鲁木齐'、'赛里木湖'"
  param :region_hint, type: :string, desc: "区域提示，帮助缩小搜索范围，如 '新疆'、'四川'", required: false

  def execute(place_name:, region_hint: nil)
    result = Geocoder.new.lookup(place_name, region_hint: region_hint)
    { lat: result.lat, lng: result.lng, formatted_address: result.formatted_address }
  rescue Geocoder::Error => e
    { error: e.message }
  end
end
