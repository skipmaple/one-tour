// Single source of truth for kind-specific detail fields.
// New kind or field? Change only here. Components iterate this at render time.
// Field type ∈ text | number | checkbox | select.
// select requires `options` array.
export const KIND_SCHEMA = {
  scenic: [
    { key: 'best_light',         label: '最佳光线',         type: 'text' },
    { key: 'altitude',           label: '海拔 (米)',       type: 'number' },
    { key: 'need_reservation',   label: '需要预约',         type: 'checkbox' },
    { key: 'ticket_info',        label: '门票',            type: 'text' },
    { key: 'recommend_stay_min', label: '建议停留 (分钟)',   type: 'number' },
  ],
  road: [
    { key: 'from_name', label: '起点',           type: 'text' },
    { key: 'to_name',   label: '终点',           type: 'text' },
    { key: 'km',        label: '里程 (km)',      type: 'number' },
    { key: 'drive_min', label: '驾驶时长 (分钟)', type: 'number' },
    { key: 'road_type', label: '路型',           type: 'select',
      options: ['高速', '国道', '省道', '山路', '城市'] },
    { key: 'day_only',  label: '仅白天通行',      type: 'checkbox' },
  ],
  food: [
    { key: 'cuisine',    label: '菜系',      type: 'text' },
    { key: 'must_eat',   label: '必吃',      type: 'text' },
    { key: 'open_hours', label: '营业时间',   type: 'text' },
    { key: 'price_pp',   label: '人均 (元)',  type: 'number' },
  ],
  stay: [
    { key: 'sanitation',       label: '卫生等级', type: 'select',
      options: ['基础', '标准', '豪华'] },
    { key: 'price_pp',         label: '人均 (元)', type: 'number' },
    { key: 'has_private_bath', label: '独立卫浴',  type: 'checkbox' },
  ],
  fuel: [
    { key: 'brand',           label: '品牌',           type: 'text' },
    { key: 'h24',             label: '24 小时',        type: 'checkbox' },
    { key: 'next_station_km', label: '到下加油站 (km)', type: 'number' },
  ],
  other: [],
}

// Valid kind values for the kind Select
export const KIND_OPTIONS = [
  { value: 'scenic', label: '景点' },
  { value: 'road',   label: '路段' },
  { value: 'food',   label: '餐饮' },
  { value: 'stay',   label: '住宿' },
  { value: 'fuel',   label: '加油' },
  { value: 'other',  label: '其他' },
]

export const CITIZEN_LEVEL_OPTIONS = [
  { value: 'tier_one',       label: '一等公民（核心）' },
  { value: 'tier_two',       label: '二等公民（配角）' },
  { value: 'tier_three',     label: '三等公民（可删）' },
  { value: 'infrastructure', label: '基础设施（自动）' },
]
