import { Text, Title, Table, Stack, List } from '@mantine/core'

// 红头文件 (red-header official document) styling
const DOC = {
  wrapper: {
    fontFamily: '"FangSong", "仿宋", "STFangsong", "华文仿宋", serif',
    fontSize: 15,
    lineHeight: 1.8,
    color: '#1a1a1a',
    padding: '0 12px',
  },
  chapter: {
    fontFamily: '"SimHei", "黑体", "STHeiti", "华文黑体", sans-serif',
    color: '#1a1a1a',
    fontSize: 17,
    fontWeight: 700,
    textAlign: 'center',
    margin: '28px 0 16px',
  },
  article: {
    fontFamily: '"SimHei", "黑体", "STHeiti", "华文黑体", sans-serif',
    fontWeight: 600,
    fontSize: 15,
  },
  body: {
    textIndent: '2em',
  },
  red: {
    color: '#c00',
    fontWeight: 700,
  },
  separator: {
    borderTop: '1px solid #ccc',
    margin: '20px 0',
  },
}

export default function ConstitutionFullText({ constitution, defaults }) {
  const c = constitution || {}
  const d = defaults || {}
  const driveH = Math.round((c.max_daily_driving_minutes || 420) / 60)
  const mtH = Math.round((c.max_mountain_road_minutes || 240) / 60)
  const t1 = c.max_tier_one_per_day || 3
  const bufDays = c.min_buffer_days || 1
  const bufMin = c.min_daily_buffer_minutes || 90
  const t2Food = c.max_tier_two_food_per_tour || 3
  const fuelEmg = c.max_fuel_emergency_per_tour || 1

  const isOverride = (field) =>
    d[field] !== undefined && c[field] !== d[field]

  const defaultDisplay = {
    max_daily_driving_minutes: `${Math.round((d.max_daily_driving_minutes || 420) / 60)} 小时`,
    max_mountain_road_minutes: `${Math.round((d.max_mountain_road_minutes || 240) / 60)} 小时`,
    max_tier_one_per_day: `${d.max_tier_one_per_day ?? 3} 个`,
    min_buffer_days: `${d.min_buffer_days ?? 1} 天`,
    min_daily_buffer_minutes: `${d.min_daily_buffer_minutes ?? 90} 分钟`,
    max_tier_two_food_per_tour: `${d.max_tier_two_food_per_tour ?? 3} 家`,
    max_fuel_emergency_per_tour: `${d.max_fuel_emergency_per_tour ?? 1} 次`,
  }

  const valProps = (field) => ({
    style: isOverride(field)
      ? { ...DOC.red, textDecoration: 'underline', fontWeight: 800 }
      : DOC.red,
    title: isOverride(field) ? `默认 ${defaultDisplay[field]}` : undefined,
  })

  return (
    <div style={DOC.wrapper}>

      {/* ═══ 第一章 ═══ */}
      <div style={DOC.chapter}>第一章　基本概念</div>

      <p style={DOC.article}>第一条　三级时间单元</p>
      <ul style={{ paddingLeft: '2em', margin: '4px 0 12px' }}>
        <li><strong>程</strong>：整个旅行周期（从落地到离开），由多个「日」组成</li>
        <li><strong>日</strong>：一个自然天（北京时间 10:00 起算至次日 10:00），由多个「行」组成</li>
        <li><strong>行</strong>：一次有目的的移动或停留，是最小的规划单元</li>
      </ul>

      <p style={DOC.article}>第二条　「行」的定义</p>
      <p style={DOC.body}>一个「行」是从 A 点出发到 B 点停留的完整过程，包含：移动过程 + 到达后的活动。「行」的类型由其目的地的公民等级决定。</p>

      <p style={DOC.article}>第三条　「日」的定义</p>
      <p style={DOC.body}>一个「日」包含多个有规律的「行」，遵循人类作息和当地节奏。西部地区（如新疆、西藏西部）比北京实际偏西约 2 小时，需考虑体感时间差。</p>

      <div style={DOC.separator} />

      {/* ═══ 第二章 ═══ */}
      <div style={DOC.chapter}>第二章　公民等级体系</div>

      <p style={DOC.article}>第四条　等级定义</p>
      <table style={{ width: '100%', borderCollapse: 'collapse', margin: '8px 0 16px', fontSize: 14 }}>
        <thead>
          <tr style={{ background: '#f8f0f0', borderBottom: '2px solid #c00' }}>
            <th style={{ padding: '8px 12px', textAlign: 'left', fontFamily: DOC.article.fontFamily }}>等级</th>
            <th style={{ padding: '8px 12px', textAlign: 'left', fontFamily: DOC.article.fontFamily }}>含义</th>
            <th style={{ padding: '8px 12px', textAlign: 'left', fontFamily: DOC.article.fontFamily }}>角色</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid #e0d0d0' }}><td style={{ padding: '6px 12px' }}>一等公民</td><td style={{ padding: '6px 12px' }}>行程存在的理由</td><td style={{ padding: '6px 12px' }}>景、路（部分）</td></tr>
          <tr style={{ borderBottom: '1px solid #e0d0d0' }}><td style={{ padding: '6px 12px' }}>二等公民</td><td style={{ padding: '6px 12px' }}>有独立吸引力</td><td style={{ padding: '6px 12px' }}>特色饭店、路（部分）</td></tr>
          <tr style={{ borderBottom: '1px solid #e0d0d0' }}><td style={{ padding: '6px 12px' }}>三等公民</td><td style={{ padding: '6px 12px' }}>服务性角色</td><td style={{ padding: '6px 12px' }}>普通饭店、宾馆</td></tr>
          <tr style={{ borderBottom: '1px solid #e0d0d0' }}><td style={{ padding: '6px 12px' }}>基础设施</td><td style={{ padding: '6px 12px' }}>无它不行但不构成目的</td><td style={{ padding: '6px 12px' }}>加油站、厕所</td></tr>
        </tbody>
      </table>

      <p style={DOC.article}>第五条　景（一等公民）</p>
      <p style={DOC.body}>自然景观是核心目的。选景原则：不可替代性优先；同类景观做减法；每个景需标注最佳光线时段、停留时间、是否需预约、海拔。</p>

      <p style={DOC.article}>第六条　路（一等或二等公民）</p>
      <p style={DOC.body}>路不是管道。一等公民路（如独库、318、滇藏等景观公路）行驶过程本身就是目的；二等公民路（如果子沟大桥段、雅鲁藏布大拐弯段）沿途有景观但不需全程慢行；普通路段仅追求效率。</p>

      <p style={DOC.article}>第七条　食（二等或三等公民）</p>
      <p style={DOC.body}>默认三等公民。满足必吃清单 / 当地特色 / 路线重合条件时可升级为二等公民，但整程不超过<span {...valProps('max_tier_two_food_per_tour')}> {t2Food} 家</span>。</p>

      <p style={DOC.article}>第八条　住（三等公民）</p>
      <p style={DOC.body}>围绕当日最后一个景点就近安排。底线：女生可接受的卫生条件、独立卫浴、手机可充电。特色民俗住宿（如毡房、蒙古包、藏式民宿）体验整程最多 1 晚。</p>

      <p style={DOC.article}>第九条　油（基础设施）</p>
      <p style={DOC.body}>铁律：逢镇必加，半箱即补。油量低于 1/4 且前方 100km 无站时升级为一等公民，整程此类升级不超过<span {...valProps('max_fuel_emergency_per_tour')}> {fuelEmg} 次</span>。</p>

      <div style={DOC.separator} />

      {/* ═══ 第三章 ═══ */}
      <div style={{ ...DOC.chapter, color: '#c00' }}>第三章　硬约束（不可突破）</div>

      <p style={DOC.article}>第十条　每日驾驶时长上限</p>
      <p style={DOC.body}>单日总驾驶时间<span {...valProps('max_daily_driving_minutes')}> ≤ {driveH} 小时</span>（含所有路段），其中山路段<span {...valProps('max_mountain_road_minutes')}> ≤ {mtH} 小时</span>。超出视为违宪，必须拆分或砍行程。</p>

      <p style={DOC.article}>第十一条　每日一等公民数量上限</p>
      <p style={DOC.body}>单日安排的一等公民（景 + 一等公民路）总数<span {...valProps('max_tier_one_per_day')}> ≤ {t1} 个</span>。每个至少需要 1.5-3 小时体验。</p>

      <p style={DOC.article}>第十二条　机动时间预留</p>
      <p style={DOC.body}>每日预留<span {...valProps('min_daily_buffer_minutes')}> ≥ {bufMin} 分钟</span>未分配时间；整程预留<span {...valProps('min_buffer_days')}> ≥ {bufDays} 个完整机动日</span>。</p>

      <p style={DOC.article}>第十三条　安全红线</p>
      <ul style={{ paddingLeft: '2em', margin: '4px 0 12px' }}>
        <li>高反症状 → 立即下撤</li>
        <li>夜间山路 → 禁止</li>
        <li>恶劣天气 → 山路行程取消</li>
        <li>司机疲劳 → 强制休息</li>
      </ul>

      <div style={DOC.separator} />

      {/* ═══ 第四章 ═══ */}
      <div style={DOC.chapter}>第四章　弹性机制</div>

      <p style={DOC.article}>第十四条　升级规则</p>
      <p style={DOC.body}>必吃级餐厅 → 食升二等（整程 ≤ {t2Food} 家）；油量紧急 → 油升一等（整程 ≤ {fuelEmg} 次）。</p>

      <p style={DOC.article}>第十五条　降级规则</p>
      <p style={DOC.body}>天气差 / 过最佳时段 / 体力不支时，一等公民必须降级或放弃。核心原则：没有任何景点值得以牺牲团队体验为代价去打卡。</p>

      <p style={DOC.article}>第十六条　熔断机制</p>
      <p style={DOC.body}>连续 2 日延误超 2 小时 / 团队疲劳度上升 / 机动日耗尽 → 主动砍一个一等公民景点。优先砍同类型中体验重叠度最高的。</p>

      <div style={DOC.separator} />

      {/* ═══ 第五章 ═══ */}
      <div style={DOC.chapter}>第五章　「程」的节奏设计</div>

      <p style={DOC.article}>第十七条　节奏曲线</p>
      <p style={DOC.body}>松→紧→松。第 1 日适应（一等公民 ≤ 1）；中间为核心行程日；最后一日收尾缓冲。</p>

      <p style={DOC.article}>第十八条　方向性原则</p>
      <p style={DOC.body}>避开大流量方向；最期待的景点放在体力天气最好的日子；对有明显方向差异的景观路段（如独库南→北），提前研究最佳行车方向。</p>

      <div style={DOC.separator} />

      {/* ═══ 第六章 ═══ */}
      <div style={DOC.chapter}>第六章　决策机制</div>

      <p style={DOC.article}>第十九条　日常决策</p>
      <p style={DOC.body}>多数决：5 人中 3 人同意即执行。</p>

      <p style={DOC.article}>第二十条　否决权</p>
      <p style={DOC.body}>安全决策、住宿标准、恶劣路况 → 任何 1 人有一票否决权。</p>

      <p style={DOC.article}>第二十一条　信息透明</p>
      <p style={DOC.body}>每晚轮值参谋确认次日路况天气、油量计划、行程概要。</p>

      <p style={DOC.article}>第二十二条　宪法修正</p>
      <p style={DOC.body}>旅行前可讨论修正。旅行后第三章硬约束不可改，其余全员一致同意可临时修正。</p>

      <p style={DOC.article}>第二十三条　优先级</p>
      <p style={DOC.body}>安全红线 &gt; 硬约束 &gt; 弹性机制 &gt; 其他条款。</p>

      {/* ═══ 落款 ═══ */}
      <div style={{ textAlign: 'right', marginTop: 32, paddingRight: 24, fontSize: 14 }}>
        <p style={{ margin: '4px 0' }}>本程全体成员</p>
        <p style={{ margin: '4px 0', color: '#999' }}>制定于出发前</p>
      </div>

      {/* 底线 */}
      <div style={{ borderTop: '2px solid #c00', marginTop: 24 }} />
    </div>
  )
}
