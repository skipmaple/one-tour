import { usePage, router, Head } from '@inertiajs/react'
import {
  Container, SimpleGrid, Card, Group, Text, Title, Tabs, Stack,
} from '@mantine/core'
import { LineChart } from '@mantine/charts'
import {
  IconUserPlus, IconUsersGroup, IconMapPlus, IconMap,
  IconMessageDots, IconCurrencyYen,
} from '@tabler/icons-react'
import { useIsMobile } from '../../hooks/useIsMobile'

const RANGES = [
  { value: 'today', label: '今天' },
  { value: '7d',    label: '近 7 天' },
  { value: '30d',   label: '近 30 天' },
]

function KpiCard({ icon: Icon, label, value }) {
  return (
    <Card withBorder padding="md" radius="md">
      <Group gap="xs" mb="xs">
        <Icon size={18} stroke={1.6} />
        <Text size="sm" c="dimmed">{label}</Text>
      </Group>
      <Title order={2}>{value}</Title>
    </Card>
  )
}

function fmtCost(cents) {
  return `¥${(cents / 100).toFixed(2)}`
}

export default function Dashboard() {
  const { props } = usePage()
  const { range, kpis, trend } = props
  const isMobile = useIsMobile()

  const onRangeChange = (value) => {
    router.get('/admin', { range: value }, { preserveState: true, preserveScroll: true })
  }

  return (
    <>
      <Head title="概览" />
      <Container fluid px="md">
        <Stack gap="lg">
          <Group justify="space-between">
            <Title order={2} fz={isMobile ? 'h3' : undefined}>概览</Title>
            <Tabs value={range} onChange={onRangeChange} variant="pills">
              <Tabs.List>
                {RANGES.map((r) => (
                  <Tabs.Tab key={r.value} value={r.value}>{r.label}</Tabs.Tab>
                ))}
              </Tabs.List>
            </Tabs>
          </Group>

          <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="md">
            <KpiCard icon={IconUserPlus}     label="新增用户"  value={kpis.new_users} />
            <KpiCard icon={IconUsersGroup}   label="活跃用户"  value={kpis.active_users} />
            <KpiCard icon={IconMapPlus}      label="新增旅程"  value={kpis.new_tours} />
            <KpiCard icon={IconMap}          label="活跃旅程"  value={kpis.active_tours} />
            <KpiCard icon={IconMessageDots}  label="AI 对话消息" value={kpis.llm_messages} />
            <KpiCard icon={IconCurrencyYen}  label="AI 对话花费" value={fmtCost(kpis.llm_cost_cents)} />
          </SimpleGrid>

          <Card withBorder padding="md" radius="md">
            <Group justify="space-between" mb="md">
              <Text fw={600}>趋势</Text>
              <Text size="sm" c="dimmed">消息数（左）· 花费 ¥（右）</Text>
            </Group>
            {/* Backend fills every day in the range with zero buckets so
                the x-axis stays stable across Tab switches, which means
                trend.length is always > 0. Detect "nothing happened" by
                checking every bucket is zero instead. */}
            {trend.every((t) => t.messages === 0 && t.cost_cents === 0) ? (
              <Text c="dimmed" ta="center" py="xl">本时段暂无数据</Text>
            ) : (
              <LineChart
                h={240}
                data={trend.map((t) => ({
                  ...t,
                  cost_yuan: t.cost_cents / 100,
                }))}
                dataKey="date"
                series={[
                  { name: 'messages',  label: '消息数', color: 'blue.6',   yAxisId: 'left'  },
                  { name: 'cost_yuan', label: '花费¥',  color: 'orange.6', yAxisId: 'right' },
                ]}
                withRightYAxis
                curveType="monotone"
                withTooltip
                withLegend
              />
            )}
          </Card>
        </Stack>
      </Container>
    </>
  )
}
