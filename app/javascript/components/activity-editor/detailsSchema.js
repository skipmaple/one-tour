// Single source of truth for kind-specific detail fields.
// field.type ∈ text | number_with_suffix | checkbox | select | autocomplete
//   number_with_suffix: { suffix, presets?, max? }
//   autocomplete:       { suggestions }
//   select:             { options }
//   text:               { placeholder? }
// field.row (optional): adjacent fields with the same row id render side-by-side
//   in a flex row (used to pair related numeric fields).
const DURATION_PRESETS = [30, 60, 90, 120, 180]

export const KIND_SCHEMA = {
  scenic: [
    { key: 'need_reservation',   label: '需要预约',   type: 'checkbox' },
    { key: 'best_light',         label: '最佳光线',   type: 'select',
      options: ['日出', '上午', '正午', '下午', '黄昏', '夜景', '全天'] },
    { key: 'altitude',           label: '海拔',       type: 'number_with_suffix', suffix: '米', max: 9000, row: 'scenic-nums' },
    { key: 'recommend_stay_min', label: '建议停留',   type: 'number_with_suffix', suffix: '分钟', presets: DURATION_PRESETS, row: 'scenic-nums' },
    { key: 'ticket_info',        label: '门票',       type: 'number_with_suffix', suffix: '元' },
  ],
  road: [
    { key: 'from_name', label: '起点',           type: 'text' },
    { key: 'to_name',   label: '终点',           type: 'text' },
    { key: 'km',        label: '里程',           type: 'number_with_suffix', suffix: 'km', row: 'road-nums' },
    { key: 'drive_min', label: '驾驶时长',       type: 'number_with_suffix', suffix: '分钟', presets: DURATION_PRESETS, row: 'road-nums' },
    { key: 'road_type', label: '路型',           type: 'select',
      options: ['高速', '国道', '省道', '山路', '城市'] },
    { key: 'day_only',  label: '仅白天通行',     type: 'checkbox' },
  ],
  food: [
    { key: 'cuisine',    label: '菜系',      type: 'autocomplete',
      suggestions: ['甘肃菜', '川菜', '粤菜', '湘菜', '东北菜', '清真', '西餐', '其他'] },
    { key: 'must_eat',   label: '必吃',      type: 'text' },
    { key: 'open_hours', label: '营业时间',   type: 'text', placeholder: '如：10:00-22:00 周一休息' },
    { key: 'price_pp',   label: '人均',       type: 'number_with_suffix', suffix: '元' },
  ],
  stay: [
    { key: 'sanitation',       label: '卫生等级', type: 'select',
      options: ['基础', '标准', '豪华'] },
    { key: 'price_pp',         label: '人均',     type: 'number_with_suffix', suffix: '元' },
    { key: 'has_private_bath', label: '独立卫浴', type: 'checkbox' },
  ],
  fuel: [
    { key: 'brand',           label: '品牌',           type: 'autocomplete',
      suggestions: ['中石化', '中石油', '壳牌', '中海油', '其他'] },
    { key: 'h24',             label: '24 小时',         type: 'checkbox' },
    { key: 'next_station_km', label: '到下加油站',      type: 'number_with_suffix', suffix: 'km' },
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

// Common field presets (consumed by CommonFields)
export const DURATION_PRESET_CHIPS = DURATION_PRESETS
