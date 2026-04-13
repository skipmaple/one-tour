module FrontmatterSchema
  COORDINATE_PAIR = { type: :array, items: :float, length: 2, description: "[latitude, longitude] — lat ∈ [-90,90], lng ∈ [-180,180]" }.freeze

  POINT = {
    name: { type: :string, required: true, description: "地点名称" },
    lat:  { type: :float, required: true, description: "纬度" },
    lng:  { type: :float, required: true, description: "经度" },
    type: { type: :string, description: "类型标签 key，对应 type_labels 中的 key（如 scenic, food, fuel, hike, stay, city）" }
  }.freeze

  DAY = {
    day:         { type: :integer, required: true, description: "天数编号，从 1 开始" },
    date:        { type: :string, description: "日期，如 '6/13 周六'" },
    title:       { type: :string, required: true, description: "当天主题/路线概要" },
    intensity:   { type: :enum, values: %w[green yellow red], description: "行程强度：green=轻松, yellow=适中, red=高强度" },
    km:          { type: :string, description: "当天行驶公里数，如 '460km'，无驾驶填 '—'" },
    drive:       { type: :string, description: "驾驶时长，如 '7h'，无驾驶填 '—'" },
    desc:        { type: :string, description: "当天行程简述" },
    coordinates: COORDINATE_PAIR.merge(required: true, description: "当天主要位置坐标 [lat, lng]，地图定位用"),
    points:      { type: :array, items: POINT, description: "当天途经的兴趣点列表" },
    schedule:    { type: :array, items: { type: :array, items: :string, length: 2 }, description: "时间表，每项为 ['时间', '活动描述']" },
    tags:        { type: :array, items: { type: :array, items: :string, length: 2 }, description: "标签列表，每项为 ['类型key', '显示文字']" },
    tips:        { type: :string, description: "当天注意事项和建议" },
    food:        { type: :string, description: "餐饮推荐" },
    stay:        { type: :string, description: "住宿推荐和价格参考" },
    ticket:      { type: :string, description: "门票信息" }
  }.freeze

  ROUTE_SEGMENT = {
    dayId:    { type: :integer, required: true, description: "所属天数编号" },
    startIdx: { type: :integer, description: "route_coordinates 起始索引（渲染用，LLM 不需要设置）" },
    endIdx:   { type: :integer, description: "route_coordinates 结束索引（渲染用，LLM 不需要设置）" },
    from:     { type: :string, required: true, description: "起点名称" },
    to:       { type: :string, required: true, description: "终点名称" },
    km:       { type: :string, description: "路段距离" },
    drive:    { type: :string, description: "驾驶时长" },
    road:     { type: :string, description: "道路类型/名称" },
    desc:     { type: :string, description: "路段描述" },
    tip:      { type: :string, description: "路段注意事项" }
  }.freeze

  POINT_DETAIL = {
    desc: { type: :string, description: "地点详细描述" },
    tip:  { type: :string, description: "实用贴士" }
  }.freeze

  PHOTO = {
    img:    { type: :hash, keys: { thumb: :string, hd: :string }, required: true, description: "图片路径，包含 thumb 和 hd 两个尺寸" },
    title:  { type: :string, description: "照片标题" },
    reason: { type: :string, description: "推荐理由/拍摄说明" }
  }.freeze

  SCHEMA = {
    title:             { type: :string, required: true, description: "旅行路书标题" },
    date_range:        { type: :string, format: "YYYY-MM-DD/YYYY-MM-DD", description: "行程日期范围" },
    vehicle:           { type: :string, description: "出行车辆" },
    team_size:         { type: :integer, description: "团队人数" },
    total_km:          { type: :integer, description: "总行程公里数" },
    trip_style:        { type: :string, description: "旅行风格/主题" },
    budget_per_person: { type: :string, description: "人均预算" },
    type_labels:       { type: :hash, keys: :string, values: :string, description: "兴趣点类型标签映射，key→显示名（含 emoji）" },
    route_coordinates: { type: :array, items: COORDINATE_PAIR, description: "完整路线坐标折线，由地图 API 生成，LLM 不需要设置" },
    days:              { type: :array, items: DAY, required: true, description: "每日行程列表" },
    route_segments:    { type: :array, items: ROUTE_SEGMENT, description: "路段详情列表，描述两地之间的驾驶信息" },
    point_details:     { type: :hash, values: POINT_DETAIL, description: "地点详情，key 为地点名称" },
    point_photos:      { type: :hash, values: { type: :array, items: PHOTO }, description: "地点照片集，key 为地点名称" }
  }.freeze

  module_function

  def to_prompt_description
    lines = []
    lines << "# 旅行路书 Frontmatter Schema"
    lines << ""
    lines << "路书内容为 Markdown 格式，文件头部以 `---` 包裹的 YAML frontmatter 描述结构化行程数据。"
    lines << ""
    lines << "## 顶层字段"
    lines << ""
    describe_fields(SCHEMA, lines, indent: 0, skip: [:days, :route_segments, :point_details, :point_photos, :route_coordinates])
    lines << ""
    lines << "## days（每日行程，必填）"
    lines << ""
    lines << "数组，每个元素描述一天的行程："
    lines << ""
    describe_fields(DAY, lines, indent: 0, skip: [:points, :schedule, :tags])
    lines << ""
    lines << "### points（兴趣点列表）"
    lines << ""
    describe_fields(POINT, lines, indent: 0)
    lines << ""
    lines << "### schedule（时间表）"
    lines << ""
    lines << "数组，每项为 `[时间, 活动描述]`，如 `[\"09:00\", \"出发前往景区\"]`"
    lines << ""
    lines << "### tags（标签列表）"
    lines << ""
    lines << "数组，每项为 `[类型key, 显示文字]`，如 `[\"scenic\", \"安集海大峡谷\"]`"
    lines << ""
    lines << "## route_segments（路段详情）"
    lines << ""
    lines << "数组，描述两地之间的驾驶路段信息："
    lines << ""
    describe_fields(ROUTE_SEGMENT, lines, indent: 0, skip: [:startIdx, :endIdx])
    lines << ""
    lines << "## point_details（地点详情）"
    lines << ""
    lines << "Hash，key 为地点名称，value 包含："
    lines << ""
    describe_fields(POINT_DETAIL, lines, indent: 0)
    lines << ""
    lines << "## 注意事项"
    lines << ""
    lines << "- 坐标格式为 `[纬度, 经度]`（注意顺序：先纬后经）"
    lines << "- 每天必须有 `coordinates` 才能发布"
    lines << "- `route_coordinates`、`startIdx`/`endIdx` 由系统自动生成，不需要手动设置"
    lines << "- `point_photos` 由图片上传功能管理，不需要手动设置"
    lines.join("\n")
  end

  def describe_fields(schema, lines, indent: 0, skip: [])
    prefix = "  " * indent
    schema.each do |key, spec|
      next if skip.include?(key)

      required = spec[:required] ? "（必填）" : ""
      type_str = format_type(spec)
      desc = spec[:description] || ""
      lines << "#{prefix}- **#{key}** `#{type_str}`#{required}：#{desc}"
    end
  end

  def format_type(spec)
    case spec[:type]
    when :string then "string"
    when :integer then "integer"
    when :float then "float"
    when :array then "array"
    when :hash then "hash"
    when :enum then "enum(#{spec[:values].join('|')})"
    else spec[:type].to_s
    end
  end
end
