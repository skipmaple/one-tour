import { useState } from 'react'
import { Stack, Group, Title, Button, Paper, Text, Select, Collapse } from '@mantine/core'
import { Head, router } from '@inertiajs/react'

export default function Constitution({ tour, constitution, defaults }) {
  const [c, setC] = useState({ ...constitution })
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const dirty = Object.keys(defaults).some(k => String(c[k]) !== String(defaults[k]))

  const save = () => {
    router.patch(`/tours/${tour.id}/constitution`, { constitution: c })
  }

  const useDefaults = () => {
    router.patch(`/tours/${tour.id}/constitution`, { constitution: defaults }, {
      onSuccess: () => router.visit(`/tours/${tour.id}`)
    })
  }

  const resetToDefaults = () => {
    if (!dirty) return
    const changedCount = Object.keys(defaults).filter(k => String(c[k]) !== String(defaults[k])).length
    if (window.confirm(`恢复默认会丢弃你已修改的 ${changedCount} 个参数，确认吗？`)) {
      setC({ ...defaults })
    }
  }

  return (
    <Stack gap="lg" p="md" maw={820} mx="auto">
      <Head title="确认宪法" />
      <Title order={2}>《本程宪法》</Title>

      <Paper p="md" bg="yellow.0" withBorder>
        <Text size="sm">
          💡 这份宪法是给你这次旅行的基础规则。<strong>大多数情况下默认值就够用</strong> —— 可以直接 "使用默认宪法，直接开始"。
          若情况特殊（老人小孩、长距离赶路、特殊饮食），往下调整相应参数。
        </Text>
      </Paper>

      <Stack gap="xs">
        <Title order={4}>关键约束</Title>
        <Text size="xs" c="dimmed">99% 的人只看这 3 条就够</Text>

        <ConstRow
          label="每天最多驾驶"
          field="max_daily_driving_minutes"
          scale={60}
          options={[ 240, 300, 360, 420, 480 ]}
          unit="小时"
          hint="防止疲劳驾驶 · 含山路和通勤"
          c={c}
          setC={setC}
        />
        <ConstRow
          label='每天最多"核心景点"'
          field="max_tier_one_per_day"
          options={[ 1, 2, 3, 4 ]}
          unit="个"
          hint="贪多嚼不烂 · 每个要 1.5-3h 体验"
          c={c}
          setC={setC}
        />
        <ConstRow
          label="整程至少机动日"
          field="min_buffer_days"
          options={[ 0, 1, 2 ]}
          unit="天"
          hint="应对天气 / 疲劳 / 突发"
          c={c}
          setC={setC}
        />
      </Stack>

      <Button variant="subtle" size="sm" onClick={() => setAdvancedOpen(o => !o)}>
        {advancedOpen ? '▴ 收起高级参数' : '▾ 高级参数（剩余 5 条，大多数情况不用改）'}
      </Button>

      <Collapse in={advancedOpen}>
        <Stack gap="xs">
          <Title order={5}>硬约束剩余</Title>
          <ConstRow label="单日山路驾驶上限" field="max_mountain_road_minutes" scale={60} options={[ 180, 240, 300 ]} unit="小时" hint="独库 / 伊昭这类山路段" c={c} setC={setC} />
          <ConstRow label="每日机动时间下限" field="min_daily_buffer_minutes" options={[ 60, 90, 120 ]} unit="分钟" hint="排队 / 拍照 / 临时停靠" c={c} setC={setC} />

          <Title order={5} mt="md">弹性配额</Title>
          <ConstRow label="整程特色餐厅总数" field="max_tier_two_food_per_tour" options={[ 2, 3, 4 ]} unit="家" hint="为吃饭绕路的上限" c={c} setC={setC} />
          <ConstRow label='整程"找油紧急升级"' field="max_fuel_emergency_per_tour" options={[ 0, 1, 2 ]} unit="次" hint="多于此说明油量规划不好" c={c} setC={setC} />
          <ConstRow label="整程毡房 / 蒙古包夜晚" field="max_yurt_nights" options={[ 0, 1, 2 ]} unit="晚" hint="需提前全员同意" c={c} setC={setC} />
        </Stack>
      </Collapse>

      <Group justify="space-between" mt="lg" pt="md" style={{ borderTop: '1px solid #eee' }}>
        <Button variant="default" onClick={resetToDefaults} disabled={!dirty}>↺ 恢复默认</Button>
        <Group>
          <Button variant="default" onClick={() => window.history.back()}>← 返回基本信息</Button>
          {dirty ? (
            <Button onClick={save}>保存修改并开始 →</Button>
          ) : (
            <Button onClick={useDefaults}>使用默认宪法，直接开始 →</Button>
          )}
        </Group>
      </Group>
    </Stack>
  )
}

function ConstRow({ label, field, scale = 1, options, unit, hint, c, setC }) {
  const current = c[field]
  const displayValue = String(current)
  const handleChange = (val) => setC({ ...c, [field]: Number(val) })
  return (
    <Group gap="xs" align="center" style={{ padding: '6px 0', borderBottom: '1px dashed #eee' }}>
      <Text size="sm" style={{ width: 220 }}>{label}</Text>
      <Select
        value={displayValue}
        onChange={handleChange}
        data={options.map(v => ({ value: String(v), label: scale === 60 ? `${v / 60} 小时` : `${v} ${unit}` }))}
        w={130}
        allowDeselect={false}
      />
      <Text size="xs" c="dimmed" style={{ flex: 1 }}>{hint}</Text>
      <Text size="xs" c="dimmed" ff="monospace" opacity={0.5}>{field}</Text>
    </Group>
  )
}
