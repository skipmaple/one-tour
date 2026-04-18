import { useMemo, useState } from 'react'
import {
  Drawer, Tabs, Stack, Group, Text, Button, Table, Badge, Card, Divider,
} from '@mantine/core'
import { router } from '@inertiajs/react'
import { notifications } from '@mantine/notifications'
import { modals } from '@mantine/modals'
import { IconPlus, IconFileExport } from '@tabler/icons-react'
import AddExpenseDialog from './AddExpenseDialog'

const CATEGORY_LABELS = {
  food: '吃饭', fuel: '加油', lodging: '住宿', ticket: '门票', refund: '退款', misc: '其他',
}

const STRATEGY_LABELS = {
  equal: 'AA 平分', percentage: '按比例', custom: '自定义金额', individual: '各付各',
}

function formatCents(cents, currency = 'CNY') {
  if (cents === null || cents === undefined) return '—'
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  const yuan = (abs / 100).toFixed(0)
  return `${sign}¥${yuan}`
}

export default function ExpenseDrawer({
  opened, onClose, tour, days, activities, members, author, expenses, summary, budgets, canEdit
}) {
  const [activeTab, setActiveTab] = useState('overview')
  const [addDialogOpen, setAddDialogOpen] = useState(false)

  const currentUser = useMemo(() => ({
    id: author?.user_id,
    email: author?.email,
  }), [author])

  const participantsLookup = useMemo(() => {
    const map = {}
    map[author.user_id] = '（作者）'
    members.forEach((m) => { map[m.user_id] = m.email })
    return map
  }, [members, author])

  const handleDeleteExpense = (expense) => {
    modals.openConfirmModal({
      title: '删除这笔花销？',
      labels: { confirm: '删除', cancel: '取消' },
      confirmProps: { color: 'red' },
      onConfirm: () => {
        router.delete(`/expenses/${expense.id}`, {
          preserveScroll: true,
          only: [ 'expenses', 'expenses_summary' ],
          onSuccess: () => notifications.show({ message: '已删除', color: 'green' }),
          onError: () => notifications.show({ message: '删除失败', color: 'red' }),
        })
      },
    })
  }

  const balance = summary?.current_user_balance
  const balanceLabel = balance && balance.net_cents > 0
    ? `应收 ${formatCents(balance.net_cents, tour.currency)}`
    : balance && balance.net_cents < 0
    ? `应付 ${formatCents(Math.abs(balance.net_cents), tour.currency)}`
    : '本次持平'

  return (
    <>
      <Drawer
        opened={opened}
        onClose={onClose}
        position="right"
        size={720}
        title={
          <Group gap="xs">
            <Text fw={600}>账单</Text>
            <Text size="xs" c="dimmed">{tour.title} · {tour.currency || 'CNY'}</Text>
          </Group>
        }
        padding="md"
      >
        <Tabs value={activeTab} onChange={setActiveTab} mb="md">
          <Tabs.List>
            <Tabs.Tab value="overview">总览</Tabs.Tab>
            <Tabs.Tab value="settle">结算</Tabs.Tab>
          </Tabs.List>
        </Tabs>

        {activeTab === 'overview' && (
          <OverviewTab
            summary={summary}
            balance={balance}
            balanceLabel={balanceLabel}
            expenses={expenses}
            participantsLookup={participantsLookup}
            tour={tour}
            activities={activities}
            days={days}
            canEdit={canEdit}
            onAddClick={() => setAddDialogOpen(true)}
            onDelete={handleDeleteExpense}
          />
        )}

        {activeTab === 'settle' && (
          <SettleTab
            summary={summary}
            expenses={expenses}
            members={members}
            author={author}
            tour={tour}
            currentUserId={currentUser.id}
          />
        )}
      </Drawer>

      <AddExpenseDialog
        opened={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        tour={tour}
        days={days}
        activities={activities}
        members={members}
        author={author}
      />
    </>
  )
}

function OverviewTab({ summary, balance, balanceLabel, expenses, participantsLookup, tour, activities, days, canEdit, onAddClick, onDelete }) {
  const activityById = useMemo(() => {
    const m = {}
    activities.forEach((a) => { m[a.id] = a })
    return m
  }, [activities])

  const dayById = useMemo(() => {
    const m = {}
    days.forEach((d) => { m[d.id] = d })
    return m
  }, [days])

  return (
    <Stack gap="md">
      {balance && (
        <Card padding="md" radius="md" style={{ background: 'linear-gradient(135deg, #e7f5ff, #d0ebff)', borderLeft: '4px solid #1677ff' }}>
          <Text size="xs" c="#1864ab" fw={500}>你这次旅行</Text>
          <Text fz={28} fw={700} c={balance.net_cents >= 0 ? '#1677ff' : '#c92a2a'} mt={4}>
            {balanceLabel}
          </Text>
          <Text size="xs" c="dimmed" mt={4}>
            你垫了 {formatCents(balance.paid_cents, tour.currency)} · 按规则该你出 {formatCents(balance.owed_cents, tour.currency)}
          </Text>
        </Card>
      )}

      {summary && (
        <Group grow>
          <Card padding="sm" radius="sm" withBorder>
            <Text size="xs" c="dimmed">总消费</Text>
            <Text fz="lg" fw={700}>{formatCents(summary.total_cents, tour.currency)}</Text>
          </Card>
          <Card padding="sm" radius="sm" withBorder>
            <Text size="xs" c="dimmed">记录笔数</Text>
            <Text fz="lg" fw={700}>{expenses.length}</Text>
          </Card>
        </Group>
      )}

      <Group justify="space-between">
        <Text fw={600} size="sm">最近的花销</Text>
        {canEdit && (
          <Button size="xs" leftSection={<IconPlus size={14} />} onClick={onAddClick}>
            记一笔
          </Button>
        )}
      </Group>

      {expenses.length === 0 ? (
        <Card padding="xl" radius="sm" withBorder>
          <Stack align="center" gap="xs">
            <Text fw={600}>还没有花销记录</Text>
            <Text size="xs" c="dimmed" ta="center">
              去过哪、花过啥、谁付的，都记下来。<br />
              结束时一键算出谁欠谁多少，不用动计算器。
            </Text>
            {canEdit && (
              <Button size="sm" leftSection={<IconPlus size={14} />} onClick={onAddClick} mt="xs">
                记第一笔
              </Button>
            )}
          </Stack>
        </Card>
      ) : (
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>花在哪</Table.Th>
              <Table.Th>谁付的</Table.Th>
              <Table.Th>类别</Table.Th>
              <Table.Th style={{ textAlign: 'right' }}>金额</Table.Th>
              <Table.Th>分摊</Table.Th>
              {canEdit && <Table.Th></Table.Th>}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {expenses.map((e) => {
              const where = e.activity_id
                ? (activityById[e.activity_id]?.name || '（已删除站点）')
                : e.day_id
                ? `${dayById[e.day_id]?.day_index ? 'D' + dayById[e.day_id].day_index : '某天'} · 全天`
                : '出发前'
              return (
                <Table.Tr key={e.id}>
                  <Table.Td>
                    <Text size="sm">{where}</Text>
                    {e.note && <Text size="xs" c="dimmed">{e.note}</Text>}
                  </Table.Td>
                  <Table.Td>{participantsLookup[e.paid_by_id] || '?'}</Table.Td>
                  <Table.Td>{CATEGORY_LABELS[e.category] || e.category}</Table.Td>
                  <Table.Td style={{ textAlign: 'right', fontWeight: 600 }}>
                    {formatCents(e.amount_cents, tour.currency)}
                  </Table.Td>
                  <Table.Td>
                    <Badge size="sm" variant="light">{STRATEGY_LABELS[e.split_strategy] || e.split_strategy}</Badge>
                  </Table.Td>
                  {canEdit && (
                    <Table.Td>
                      <Button size="compact-xs" variant="subtle" color="red" onClick={() => onDelete(e)}>
                        删
                      </Button>
                    </Table.Td>
                  )}
                </Table.Tr>
              )
            })}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  )
}

function SettleTab({ summary, expenses, members, author, tour }) {
  if (!summary || expenses.length === 0) {
    return (
      <Card padding="xl" radius="sm" withBorder>
        <Text size="sm" ta="center" c="dimmed">还没有花销，无需结算</Text>
      </Card>
    )
  }

  // Compute net per member: paid - owed.
  const userRows = [ author, ...members ].reduce((acc, m) => {
    const uid = m.user_id
    if (acc.find((r) => r.user_id === uid)) return acc
    const paid = summary.per_member_paid?.[uid] || 0
    const owed = summary.per_member_owed?.[uid] || 0
    acc.push({
      user_id: uid,
      email: m.email,
      paid, owed,
      net: paid - owed,
    })
    return acc
  }, [])

  // Greedy N-1 settlement mirroring the server-side Expense::Settle logic.
  const transfers = computeTransfers(userRows.map((r) => [ r.user_id, r.net ]))
  const userLookup = Object.fromEntries(userRows.map((r) => [ r.user_id, r.email ]))

  return (
    <Stack gap="md">
      <Text fw={600} size="sm">每个人应收 / 应付</Text>
      <Stack gap="xs">
        {userRows.map((r) => (
          <Card key={r.user_id} padding="sm" radius="sm" withBorder
                style={{ borderLeft: `3px solid ${r.net > 0 ? '#2b8a3e' : r.net < 0 ? '#c92a2a' : '#888'}` }}>
            <Group justify="space-between">
              <div>
                <Text size="sm" fw={500}>{r.email}</Text>
                <Text size="xs" c="dimmed">
                  垫了 {formatCents(r.paid, tour.currency)} · 该承担 {formatCents(r.owed, tour.currency)}
                </Text>
              </div>
              <Text fw={600} c={r.net > 0 ? '#2b8a3e' : r.net < 0 ? '#c92a2a' : undefined}>
                {r.net > 0 ? `应收 ${formatCents(r.net, tour.currency)}` :
                 r.net < 0 ? `应付 ${formatCents(Math.abs(r.net), tour.currency)}` : '持平'}
              </Text>
            </Group>
          </Card>
        ))}
      </Stack>

      <Divider my="sm" label="转账方案" labelPosition="left" />

      {transfers.length === 0 ? (
        <Text size="sm" c="dimmed">所有人持平，无需转账</Text>
      ) : (
        <>
          <Text size="xs" c="dimmed">{transfers.length} 笔转账就能全部理清</Text>
          <Stack gap="xs">
            {transfers.map((t, i) => (
              <Card key={i} padding="sm" radius="sm" withBorder>
                <Group justify="space-between">
                  <Text size="sm">
                    <span>{userLookup[t.from] || '?'}</span>
                    <Text component="span" c="#1677ff" mx="xs" fw={700}>→</Text>
                    <span>{userLookup[t.to] || '?'}</span>
                  </Text>
                  <Text fw={700}>{formatCents(t.amount, tour.currency)}</Text>
                </Group>
              </Card>
            ))}
          </Stack>
        </>
      )}
    </Stack>
  )
}

// Same greedy algorithm as Expense::Settle.rb, client-side.
function computeTransfers(netEntries) {
  const net = new Map(netEntries)
  const transfers = []
  let safety = 100
  while (safety-- > 0) {
    const entries = [ ...net.entries() ]
    if (entries.length === 0) break
    const [ creditorId, creditorNet ] = entries.reduce((a, b) => (b[1] > a[1] ? b : a))
    const [ debtorId, debtorNet ] = entries.reduce((a, b) => (b[1] < a[1] ? b : a))
    if (creditorNet <= 0 || debtorNet >= 0) break
    const amount = Math.min(creditorNet, -debtorNet)
    transfers.push({ from: debtorId, to: creditorId, amount })
    net.set(creditorId, creditorNet - amount)
    net.set(debtorId, debtorNet + amount)
  }
  return transfers
}
