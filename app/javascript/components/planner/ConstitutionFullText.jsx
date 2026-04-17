import { Text, Title, Table, Stack, List, Divider } from '@mantine/core'

export default function ConstitutionFullText({ constitution }) {
  const c = constitution || {}
  const driveH = Math.round((c.max_daily_driving_minutes || 420) / 60)
  const mtH = Math.round((c.max_mountain_road_minutes || 240) / 60)
  const t1 = c.max_tier_one_per_day || 3
  const bufDays = c.min_buffer_days || 1
  const bufMin = c.min_daily_buffer_minutes || 90
  const t2Food = c.max_tier_two_food_per_tour || 3
  const fuelEmg = c.max_fuel_emergency_per_tour || 1

  return (
    <Stack gap="md">
      {/* 第一章 */}
      <Title order={4}>第一章 基本概念</Title>

      <Text size="sm" fw={600}>第一条 三级时间单元</Text>
      <List size="sm" spacing={4}>
        <List.Item><strong>程</strong>：整个旅行周期（从落地到离开），由多个「日」组成</List.Item>
        <List.Item><strong>日</strong>：一个自然天（北京时间 10:00 起算至次日 10:00），由多个「行」组成</List.Item>
        <List.Item><strong>行</strong>：一次有目的的移动或停留，是最小的规划单元</List.Item>
      </List>

      <Text size="sm" fw={600}>第二条 「行」的定义</Text>
      <Text size="sm">一个「行」是从 A 点出发到 B 点停留的完整过程，包含：移动过程 + 到达后的活动。「行」的类型由其目的地的公民等级决定。</Text>

      <Text size="sm" fw={600}>第三条 「日」的定义</Text>
      <Text size="sm">一个「日」包含多个有规律的「行」，遵循人类作息和当地节奏。伊犁比北京偏西约 30 个经度，手机时间减 2 小时 = 体感时间。</Text>

      <Divider />

      {/* 第二章 */}
      <Title order={4}>第二章 公民等级体系</Title>

      <Text size="sm" fw={600}>第四条 等级定义</Text>
      <Table size="sm" withTableBorder withColumnBorders>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>等级</Table.Th>
            <Table.Th>代号</Table.Th>
            <Table.Th>含义</Table.Th>
            <Table.Th>角色</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          <Table.Tr><Table.Td>一等公民</Table.Td><Table.Td>⭐</Table.Td><Table.Td>行程存在的理由</Table.Td><Table.Td>景、路（部分）</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>二等公民</Table.Td><Table.Td>🔸</Table.Td><Table.Td>有独立吸引力</Table.Td><Table.Td>特色饭店、路（部分）</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>三等公民</Table.Td><Table.Td>◽</Table.Td><Table.Td>服务性角色</Table.Td><Table.Td>普通饭店、宾馆</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>基础设施</Table.Td><Table.Td>⚙️</Table.Td><Table.Td>无它不行但不构成目的</Table.Td><Table.Td>加油站、厕所</Table.Td></Table.Tr>
        </Table.Tbody>
      </Table>

      <Text size="sm" fw={600}>第五条 景（⭐ 一等公民）</Text>
      <Text size="sm">自然景观是核心目的。选景原则：不可替代性优先；同类景观做减法；每个景需标注最佳光线时段、停留时间、是否需预约、海拔。</Text>

      <Text size="sm" fw={600}>第六条 路（⭐ 或 🔸）</Text>
      <Text size="sm">路不是管道。一等公民路（独库、伊昭）行驶过程本身就是目的；二等公民路（果子沟大桥段）沿途有景观但不需全程慢行；普通路段仅追求效率。</Text>

      <Text size="sm" fw={600}>第七条 食（🔸 或 ◽）</Text>
      <Text size="sm">默认三等公民。满足必吃清单 / 当地特色 / 路线重合条件时可升级为二等公民，但整程不超过 <strong>{t2Food} 家</strong>。</Text>

      <Text size="sm" fw={600}>第八条 住（◽ 三等公民）</Text>
      <Text size="sm">围绕当日最后一个景点就近安排。底线：女生可接受的卫生条件、独立卫浴、手机可充电。毡房/蒙古包体验整程最多 1 晚。</Text>

      <Text size="sm" fw={600}>第九条 油（⚙️ 基础设施）</Text>
      <Text size="sm">铁律：逢镇必加，半箱即补。油量低于 1/4 且前方 100km 无站时升级为一等公民，整程此类升级不超过 <strong>{fuelEmg} 次</strong>。</Text>

      <Divider />

      {/* 第三章 */}
      <Title order={4}>第三章 硬约束（不可突破）</Title>

      <Text size="sm" fw={600}>第十条 每日驾驶时长上限</Text>
      <Text size="sm">单日总驾驶时间 <strong>≤ {driveH} 小时</strong>（含所有路段），其中山路段 <strong>≤ {mtH} 小时</strong>。超出视为违宪，必须拆分或砍行程。</Text>

      <Text size="sm" fw={600}>第十一条 每日一等公民数量上限</Text>
      <Text size="sm">单日安排的一等公民（景 + 一等公民路）总数 <strong>≤ {t1} 个</strong>。每个至少需要 1.5-3 小时体验。</Text>

      <Text size="sm" fw={600}>第十二条 机动时间预留</Text>
      <Text size="sm">每日预留 <strong>≥ {bufMin} 分钟</strong>未分配时间；整程预留 <strong>≥ {bufDays} 个完整机动日</strong>。</Text>

      <Text size="sm" fw={600}>第十三条 安全红线</Text>
      <List size="sm" spacing={4}>
        <List.Item>高反症状 → 立即下撤</List.Item>
        <List.Item>夜间山路 → 禁止</List.Item>
        <List.Item>恶劣天气 → 山路行程取消</List.Item>
        <List.Item>司机疲劳 → 强制休息</List.Item>
      </List>

      <Divider />

      {/* 第四章 */}
      <Title order={4}>第四章 弹性机制</Title>

      <Text size="sm" fw={600}>第十四条 升级规则</Text>
      <Text size="sm">必吃级餐厅 → 食升二等（整程 ≤ {t2Food} 家）；油量紧急 → 油升一等（整程 ≤ {fuelEmg} 次）。</Text>

      <Text size="sm" fw={600}>第十五条 降级规则</Text>
      <Text size="sm">天气差 / 过最佳时段 / 体力不支时，一等公民必须降级或放弃。核心原则：没有任何景点值得以牺牲团队体验为代价去打卡。</Text>

      <Text size="sm" fw={600}>第十六条 熔断机制</Text>
      <Text size="sm">连续 2 日延误超 2 小时 / 团队疲劳度上升 / 机动日耗尽 → 主动砍一个一等公民景点。优先砍同类型中体验重叠度最高的。</Text>

      <Divider />

      {/* 第五章 */}
      <Title order={4}>第五章 「程」的节奏设计</Title>

      <Text size="sm" fw={600}>第十七条 节奏曲线</Text>
      <Text size="sm">松→紧→松。第 1 日适应（一等公民 ≤ 1）；中间为核心行程日；最后一日收尾缓冲。</Text>

      <Text size="sm" fw={600}>第十八条 方向性原则</Text>
      <Text size="sm">避开大流量方向；最期待的景点放在体力天气最好的日子；独库建议南→北走。</Text>

      <Divider />

      {/* 第六章 */}
      <Title order={4}>第六章 决策机制</Title>

      <Text size="sm" fw={600}>第十九条 日常决策</Text>
      <Text size="sm">多数决：5 人中 3 人同意即执行。</Text>

      <Text size="sm" fw={600}>第二十条 否决权</Text>
      <Text size="sm">安全决策、住宿标准、恶劣路况 → 任何 1 人有一票否决权。</Text>

      <Text size="sm" fw={600}>第二十一条 信息透明</Text>
      <Text size="sm">每晚轮值参谋确认次日路况天气、油量计划、行程概要。</Text>

      <Text size="sm" fw={600}>第二十二条 宪法修正</Text>
      <Text size="sm">旅行前可讨论修正。旅行后第三章硬约束不可改，其余全员一致同意可临时修正。</Text>

      <Text size="sm" fw={600}>第二十三条 优先级</Text>
      <Text size="sm">安全红线 {'>'} 硬约束 {'>'} 弹性机制 {'>'} 其他条款。</Text>
    </Stack>
  )
}
