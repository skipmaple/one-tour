// Moved from pages/Tour/Constitution.jsx (2026-04-21) so ConstitutionDrawer can reuse.

import { Stack, Group, Title, Text, Button, Select } from '@mantine/core'
import { useIsMobile } from '../../hooks/useIsMobile'

export default function ParameterEditor({ c, setC, dirty, advancedOpen, setAdvancedOpen, advancedCount, resetToDefaults }) {
  const isMobile = useIsMobile()
  return (
    <>
      <Stack gap="xs">
        <Title order={4}>关键约束</Title>
        <Text size="xs" c="dimmed">99% 的人只看这 3 条就够</Text>
        <ConstRow label="每天最多驾驶" field="max_daily_driving_minutes" scale={60} options={[240, 300, 360, 420, 480]} unit="小时" hint="防止疲劳驾驶 · 含山路和通勤" c={c} setC={setC} isMobile={isMobile} />
        <ConstRow label='每天最多"核心景点"' field="max_tier_one_per_day" options={[1, 2, 3, 4]} unit="个" hint="贪多嚼不烂 · 每个要 1.5-3h 体验" c={c} setC={setC} isMobile={isMobile} />
        <ConstRow label="整程至少机动日" field="min_buffer_days" options={[0, 1, 2]} unit="天" hint="应对天气 / 疲劳 / 突发" c={c} setC={setC} isMobile={isMobile} />
      </Stack>
      <Button variant="subtle" size="sm" onClick={() => setAdvancedOpen(o => !o)}>
        {advancedOpen ? '▴ 收起高级参数' : `▾ 高级参数（剩余 ${advancedCount} 条，大多数情况不用改）`}
      </Button>
      {advancedOpen && (
        <Stack gap="xs">
          <Title order={5}>硬约束剩余</Title>
          <ConstRow label="单日山路驾驶上限" field="max_mountain_road_minutes" scale={60} options={[180, 240, 300]} unit="小时" hint="独库 / 伊昭这类山路段" c={c} setC={setC} isMobile={isMobile} />
          <ConstRow label="每日机动时间下限" field="min_daily_buffer_minutes" options={[60, 90, 120]} unit="分钟" hint="排队 / 拍照 / 临时停靠" c={c} setC={setC} isMobile={isMobile} />
          <Title order={5} mt="md">弹性配额</Title>
          <ConstRow label="整程特色餐厅总数" field="max_tier_two_food_per_tour" options={[2, 3, 4]} unit="家" hint="为吃饭绕路的上限" c={c} setC={setC} isMobile={isMobile} />
          <ConstRow label='整程"找油紧急升级"' field="max_fuel_emergency_per_tour" options={[0, 1, 2]} unit="次" hint="多于此说明油量规划不好" c={c} setC={setC} isMobile={isMobile} />
        </Stack>
      )}
    </>
  )
}

function ConstRow({ label, field, scale = 1, options, unit, hint, c, setC, isMobile }) {
  const current = c[field]
  const displayValue = String(current)
  const handleChange = (val) => setC({ ...c, [field]: Number(val) })
  return (
    <Group gap="xs" align="center" wrap="wrap" style={{ padding: '6px 0', borderBottom: '1px dashed #eee' }}>
      <Text size="sm" style={{ width: isMobile ? '100%' : 220 }}>{label}</Text>
      <Select
        value={displayValue}
        onChange={handleChange}
        data={options.map(v => ({ value: String(v), label: scale === 60 ? `${v / 60} 小时` : `${v} ${unit}` }))}
        w={isMobile ? '100%' : 130}
        allowDeselect={false}
      />
      <Text size="xs" c="dimmed" style={{ flex: 1 }}>{hint}</Text>
    </Group>
  )
}
