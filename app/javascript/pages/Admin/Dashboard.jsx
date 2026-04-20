import { usePage, router } from '@inertiajs/react'
import {
  Container, SimpleGrid, Card, Group, Text, Title, Tabs, Stack,
} from '@mantine/core'
import {
  IconUserPlus, IconUsersGroup, IconMapPlus, IconMap,
  IconMessageDots, IconCurrencyYen,
} from '@tabler/icons-react'
import AdminShell from '../../components/admin/AdminShell'

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
  const { url, props } = usePage()
  const { range, kpis } = props

  const onRangeChange = (value) => {
    router.get('/admin', { range: value }, { preserveState: true, preserveScroll: true })
  }

  return (
    <AdminShell currentPath={url.split('?')[0]}>
      <Container size="lg" px={0}>
        <Stack gap="lg">
          <Group justify="space-between">
            <Title order={2}>Dashboard</Title>
            <Tabs value={range} onChange={onRangeChange} variant="pills">
              <Tabs.List>
                {RANGES.map((r) => (
                  <Tabs.Tab key={r.value} value={r.value}>{r.label}</Tabs.Tab>
                ))}
              </Tabs.List>
            </Tabs>
          </Group>

          <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="md">
            <KpiCard icon={IconUserPlus}     label="新增用户" value={kpis.new_users} />
            <KpiCard icon={IconUsersGroup}   label="活跃用户" value={kpis.active_users} />
            <KpiCard icon={IconMapPlus}      label="新增 Tour" value={kpis.new_tours} />
            <KpiCard icon={IconMap}          label="活跃 Tour" value={kpis.active_tours} />
            <KpiCard icon={IconMessageDots}  label="LLM 消息" value={kpis.llm_messages} />
            <KpiCard icon={IconCurrencyYen}  label="LLM 成本" value={fmtCost(kpis.llm_cost_cents)} />
          </SimpleGrid>
        </Stack>
      </Container>
    </AdminShell>
  )
}
