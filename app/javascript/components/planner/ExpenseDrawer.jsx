import { useMemo, useState, useEffect } from 'react'
import {
  Drawer, Tabs, Stack, Group, Text, Button, Table, Badge, Card, Divider,
  SegmentedControl, Accordion, Progress,
} from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { router, usePage } from '@inertiajs/react'
import { notifications } from '@mantine/notifications'
import { modals } from '@mantine/modals'
import { IconPlus, IconFileExport, IconReceipt2, IconWallet } from '@tabler/icons-react'
import AddExpenseDialog from './AddExpenseDialog'
import BudgetModal from './BudgetModal'
import ManualSettlementDialog from './ManualSettlementDialog'
import ActivityGalleryLightbox from '../activity-editor/ActivityGalleryLightbox'
import { groupExpenses } from './expenseGrouping'

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
  opened, onClose, tour, days, activities, members, author, expenses, summary, budgets, settlements, canEdit
}) {
  const [activeTab, setActiveTab] = useState('overview')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingExpenseId, setEditingExpenseId] = useState(null)
  const [rowLightbox, setRowLightbox] = useState({ receipts: [], index: null })
  const [budgetModalOpen, setBudgetModalOpen] = useState(false)
  const [manualSettlementOpen, setManualSettlementOpen] = useState(false)
  const isMobile = useMediaQuery('(max-width: 640px)')

  // Derive the editing expense from fresh props so receipt uploads/deletes
  // (which trigger router.reload) surface without closing the dialog.
  const editingExpense = useMemo(
    () => editingExpenseId ? expenses.find((e) => e.id === editingExpenseId) : null,
    [editingExpenseId, expenses],
  )

  // Actual logged-in user from Inertia's shared props — NOT the tour author.
  // Used for party-based authorization on settlements (I can mark/undo
  // transfers that involve me regardless of my tour role).
  const currentUserId = usePage().props.current_user?.id

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
        // Capture full shape BEFORE delete so we can rebuild it if user hits 撤销.
        // Receipts are cascaded + their blobs are gone; can't undo those.
        const snapshot = {
          scope: expense.scope,
          activity_id: expense.activity_id,
          day_id: expense.day_id,
          paid_by_id: expense.paid_by_id,
          amount_cents: expense.amount_cents,
          category: expense.category,
          note: expense.note,
          split_strategy: expense.split_strategy,
          external_count: expense.external_count || 0,
          external_attributed_to_id: expense.external_attributed_to_id,
          participant_ids: expense.splits?.map((s) => s.user_id) || [],
          had_receipts: (expense.receipts?.length || 0) > 0,
        }

        router.delete(`/expenses/${expense.id}`, {
          preserveScroll: true,
          only: [ 'expenses', 'expenses_summary', 'flash' ],
          onSuccess: (page) => {
            const alert = page?.props?.flash?.alert
            if (alert) {
              notifications.show({ message: alert, color: 'red' })
            } else {
              showUndoToast(snapshot)
            }
          },
          onError: () => notifications.show({ message: '删除失败', color: 'red' }),
        })
      },
    })
  }

  const showUndoToast = (snapshot) => {
    const notifId = `undo-${Date.now()}`
    notifications.show({
      id: notifId,
      color: 'green',
      autoClose: 8000,
      withCloseButton: true,
      message: (
        <Group justify="space-between" gap="xs" wrap="nowrap">
          <Text size="sm">已删除</Text>
          <Button
            size="compact-xs"
            variant="subtle"
            onClick={() => undoDelete(snapshot, notifId)}
          >
            撤销
          </Button>
        </Group>
      ),
    })
  }

  const undoDelete = (snapshot, notifId) => {
    notifications.hide(notifId)
    const payload = {
      expense: {
        scope: snapshot.scope,
        activity_id: snapshot.activity_id,
        day_id: snapshot.day_id,
        paid_by_id: snapshot.paid_by_id,
        amount_cents: snapshot.amount_cents,
        category: snapshot.category,
        note: snapshot.note,
        split_strategy: snapshot.split_strategy,
        external_count: snapshot.external_count,
        external_attributed_to_id: snapshot.external_attributed_to_id,
      },
    }
    if (snapshot.split_strategy === 'equal' && snapshot.participant_ids.length > 0) {
      payload.participant_ids = snapshot.participant_ids
    }
    router.post(`/tours/${tour.id}/expenses`, payload, {
      preserveScroll: true,
      only: [ 'expenses', 'expenses_summary', 'flash' ],
      onSuccess: () => notifications.show({
        message: snapshot.had_receipts ? '已恢复（小票已丢失，需重新上传）' : '已恢复',
        color: 'green',
      }),
      onError: () => notifications.show({ message: '恢复失败', color: 'red' }),
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
        size={isMobile ? '100%' : 720}
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
            budgets={budgets || []}
            canEdit={canEdit}
            isMobile={isMobile}
            onAddClick={() => { setEditingExpenseId(null); setDialogOpen(true) }}
            onEdit={(e) => { setEditingExpenseId(e.id); setDialogOpen(true) }}
            onDelete={handleDeleteExpense}
            onReceiptClick={(e) => setRowLightbox({ receipts: e.receipts || [], index: 0 })}
            onEditBudget={() => setBudgetModalOpen(true)}
          />
        )}

        {activeTab === 'settle' && (
          <SettleTab
            summary={summary}
            expenses={expenses}
            settlements={settlements || []}
            members={members}
            author={author}
            tour={tour}
            canEdit={canEdit}
            currentUserId={currentUserId}
            onManualRecord={() => setManualSettlementOpen(true)}
          />
        )}
      </Drawer>

      <AddExpenseDialog
        opened={dialogOpen}
        onClose={() => setDialogOpen(false)}
        tour={tour}
        days={days}
        activities={activities}
        members={members}
        author={author}
        expense={editingExpense}
        readOnly={!canEdit}
      />

      <ActivityGalleryLightbox
        images={rowLightbox.receipts}
        initialIndex={rowLightbox.index}
        onClose={() => setRowLightbox({ receipts: [], index: null })}
      />

      <BudgetModal
        opened={budgetModalOpen}
        onClose={() => setBudgetModalOpen(false)}
        tour={tour}
        days={days}
        budgets={budgets || []}
      />

      <ManualSettlementDialog
        opened={manualSettlementOpen}
        onClose={() => setManualSettlementOpen(false)}
        tour={tour}
        members={members}
        author={author}
        currentUserId={currentUserId}
      />
    </>
  )
}

function OverviewTab({ summary, balance, balanceLabel, expenses, participantsLookup, tour, activities, days, budgets, canEdit, isMobile, onAddClick, onEdit, onDelete, onReceiptClick, onEditBudget }) {
  const [grouping, setGrouping] = useState('flat')

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

  const groups = useMemo(
    () => groupExpenses(expenses, grouping, activityById, dayById),
    [expenses, grouping, activityById, dayById],
  )

  // Show the grouping toggle only when it adds value — i.e. some grouping
  // mode would actually split into ≥2 buckets. 1-day tours with every
  // expense in the same bucket would produce a single Accordion wrapper,
  // which is pure overhead. An arbitrary minimum-entries threshold is
  // unreliable: 3 expenses across 2 days is already useful to group.
  const groupingToggleUseful = useMemo(() => {
    if (expenses.length === 0) return false
    const byDay = groupExpenses(expenses, 'by_day', activityById, dayById)
    const byAct = groupExpenses(expenses, 'by_activity', activityById, dayById)
    return (byDay?.length ?? 0) > 1 || (byAct?.length ?? 0) > 1
  }, [expenses, activityById, dayById])

  // If the toggle becomes unavailable while user is in a grouped mode, snap
  // back to flat so they don't get stuck.
  useEffect(() => {
    if (!groupingToggleUseful && grouping !== 'flat') setGrouping('flat')
  }, [groupingToggleUseful, grouping])

  return (
    <Stack gap="md">
      {balance && (balance.paid_cents !== 0 || balance.owed_cents !== 0) && (
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

      {/* Budget is personal — show when the current user is participating
          (paid or owed anything) or already has a budget set. A pure observer
          with no stake has no reason to see the card. */}
      {balance && (balance.paid_cents !== 0 || balance.owed_cents !== 0 || balance.tour_budget_cents != null) && (
        <BudgetCard balance={balance} tour={tour} onEditBudget={onEditBudget} />
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

      {groupingToggleUseful && (
        <SegmentedControl
          value={grouping}
          onChange={setGrouping}
          data={[
            { value: 'flat',        label: '时间顺序' },
            { value: 'by_day',      label: '按天' },
            { value: 'by_activity', label: '按行' },
          ]}
          size="xs"
          fullWidth
        />
      )}

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
      ) : grouping === 'flat' || !groups ? (
        <ExpenseTable
          expenses={expenses}
          activityById={activityById}
          dayById={dayById}
          participantsLookup={participantsLookup}
          tour={tour}
          canEdit={canEdit}
          onEdit={onEdit}
          onDelete={onDelete}
          onReceiptClick={onReceiptClick}
          isMobile={isMobile}
        />
      ) : (
        <Accordion key={grouping} multiple defaultValue={groups.map((g) => g.key)} variant="separated">
          {groups.map((g) => {
            const subtotal = g.expenses.reduce((s, e) => s + (e.amount_cents || 0), 0)
            return (
              <Accordion.Item key={g.key} value={g.key}>
                <Accordion.Control>
                  <Group justify="space-between" wrap="nowrap" pr="xs">
                    <Text fw={500} size="sm" truncate>{g.label}</Text>
                    <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                      {g.expenses.length} 笔 · {formatCents(subtotal, tour.currency)}
                    </Text>
                  </Group>
                </Accordion.Control>
                <Accordion.Panel>
                  <ExpenseTable
                    expenses={g.expenses}
                    activityById={activityById}
                    dayById={dayById}
                    participantsLookup={participantsLookup}
                    tour={tour}
                    canEdit={canEdit}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onReceiptClick={onReceiptClick}
                    isMobile={isMobile}
                  />
                </Accordion.Panel>
              </Accordion.Item>
            )
          })}
        </Accordion>
      )}
    </Stack>
  )
}

function BudgetCard({ balance, tour, onEditBudget }) {
  const budgetCents = balance?.tour_budget_cents
  const owed = balance?.owed_cents || 0
  const overCents = balance?.over_tour_budget_cents || 0

  if (!budgetCents) {
    return (
      <Card padding="sm" radius="sm" withBorder>
        <Group justify="space-between" gap="xs">
          <Group gap="xs">
            <IconWallet size={16} stroke={1.5} color="#868e96" />
            <Text size="sm" c="dimmed">还没设我的预算</Text>
          </Group>
          <Button size="compact-xs" variant="light" onClick={onEditBudget}>设预算</Button>
        </Group>
      </Card>
    )
  }

  const percent = Math.min(owed / budgetCents, 1) * 100
  const overSpent = overCents > 0

  return (
    <Card
      padding="md"
      radius="sm"
      withBorder
      style={overSpent ? { borderLeft: '4px solid #fa5252', background: '#fff5f5' } : {}}
    >
      <Group justify="space-between" mb={6}>
        <Group gap="xs">
          <IconWallet size={16} stroke={1.5} color={overSpent ? '#c92a2a' : '#868e96'} />
          <Text size="sm" fw={500}>我的预算</Text>
        </Group>
        <Button size="compact-xs" variant="subtle" onClick={onEditBudget}>编辑</Button>
      </Group>
      <Progress value={percent} color={overSpent ? 'red' : 'blue'} size="sm" />
      <Group justify="space-between" mt={6}>
        <Text size="xs" c="dimmed">
          已承担 {formatCents(owed, tour.currency)} / 预算 {formatCents(budgetCents, tour.currency)}
        </Text>
        {overSpent && (
          <Text size="xs" c="red" fw={500}>
            超出 {formatCents(overCents, tour.currency)}
          </Text>
        )}
      </Group>
    </Card>
  )
}

function ExpenseTable({ expenses, activityById, dayById, participantsLookup, tour, canEdit, onEdit, onDelete, onReceiptClick, isMobile }) {
  if (isMobile) {
    return (
      <Stack gap="xs">
        {expenses.map((e) => {
          const where = e.activity_id
            ? (activityById[e.activity_id]?.name || '（已删除行）')
            : e.day_id
            ? `${dayById[e.day_id]?.day_index ? 'D' + dayById[e.day_id].day_index : '某天'} · 全天`
            : '出发前'
          return (
            <Card key={e.id} padding="sm" radius="sm" withBorder>
              <Group justify="space-between" align="flex-start" wrap="nowrap" gap="xs">
                <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                  <Text fw={500} size="sm" truncate>{where}</Text>
                  {e.note && <Text size="xs" c="dimmed" truncate>{e.note}</Text>}
                  <Group gap="xs" wrap="wrap">
                    <Text size="xs" c="dimmed">{participantsLookup[e.paid_by_id] || '?'}</Text>
                    <Text size="xs" c="dimmed">·</Text>
                    <Text size="xs" c="dimmed">{CATEGORY_LABELS[e.category] || e.category}</Text>
                    <Badge size="xs" variant="light">{STRATEGY_LABELS[e.split_strategy] || e.split_strategy}</Badge>
                  </Group>
                  {e.receipts?.length > 0 && (
                    <Group
                      gap={4}
                      mt={2}
                      onClick={(ev) => { ev.stopPropagation(); onReceiptClick?.(e) }}
                      style={{ cursor: onReceiptClick ? 'pointer' : 'default', width: 'fit-content' }}
                      role={onReceiptClick ? 'button' : undefined}
                      aria-label={onReceiptClick ? '查看小票' : undefined}
                    >
                      <IconReceipt2 size={12} stroke={1.5} style={{ color: '#1677ff' }} />
                      <Text size="xs" c="#1677ff">{e.receipts.length}</Text>
                    </Group>
                  )}
                </Stack>
                <Stack gap={4} align="flex-end" style={{ flexShrink: 0 }}>
                  <Text fw={700} size="md">{formatCents(e.amount_cents, tour.currency)}</Text>
                  <Group gap={6} wrap="nowrap">
                    {canEdit ? (
                      <>
                        <Button size="compact-xs" variant="subtle" onClick={() => onEdit(e)}>改</Button>
                        <Button size="compact-xs" variant="subtle" color="red" onClick={() => onDelete(e)}>删</Button>
                      </>
                    ) : (
                      <Button size="compact-xs" variant="subtle" onClick={() => onEdit(e)}>看</Button>
                    )}
                  </Group>
                </Stack>
              </Group>
            </Card>
          )
        })}
      </Stack>
    )
  }
  return (
    <Table>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>花在哪</Table.Th>
          <Table.Th>谁付的</Table.Th>
          <Table.Th>类别</Table.Th>
          <Table.Th style={{ textAlign: 'right' }}>金额</Table.Th>
          <Table.Th>分摊</Table.Th>
          <Table.Th></Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {expenses.map((e) => {
          const where = e.activity_id
            ? (activityById[e.activity_id]?.name || '（已删除行）')
            : e.day_id
            ? `${dayById[e.day_id]?.day_index ? 'D' + dayById[e.day_id].day_index : '某天'} · 全天`
            : '出发前'
          return (
            <Table.Tr key={e.id}>
              <Table.Td>
                <Text size="sm">{where}</Text>
                {e.note && <Text size="xs" c="dimmed">{e.note}</Text>}
                {e.receipts?.length > 0 && (
                  <Group
                    gap={4}
                    mt={2}
                    onClick={(ev) => { ev.stopPropagation(); onReceiptClick?.(e) }}
                    style={{ cursor: onReceiptClick ? 'pointer' : 'default', width: 'fit-content' }}
                    role={onReceiptClick ? 'button' : undefined}
                    aria-label={onReceiptClick ? '查看小票' : undefined}
                  >
                    <IconReceipt2 size={12} stroke={1.5} style={{ color: '#1677ff' }} />
                    <Text size="xs" c="#1677ff">{e.receipts.length}</Text>
                  </Group>
                )}
              </Table.Td>
              <Table.Td>{participantsLookup[e.paid_by_id] || '?'}</Table.Td>
              <Table.Td>{CATEGORY_LABELS[e.category] || e.category}</Table.Td>
              <Table.Td style={{ textAlign: 'right', fontWeight: 600 }}>
                {formatCents(e.amount_cents, tour.currency)}
              </Table.Td>
              <Table.Td>
                <Badge size="sm" variant="light">{STRATEGY_LABELS[e.split_strategy] || e.split_strategy}</Badge>
              </Table.Td>
              <Table.Td>
                <Group gap={4} wrap="nowrap" justify="flex-end">
                  {canEdit ? (
                    <>
                      <Button size="compact-xs" variant="subtle" onClick={() => onEdit(e)}>改</Button>
                      <Button size="compact-xs" variant="subtle" color="red" onClick={() => onDelete(e)}>删</Button>
                    </>
                  ) : (
                    <Button size="compact-xs" variant="subtle" onClick={() => onEdit(e)}>看</Button>
                  )}
                </Group>
              </Table.Td>
            </Table.Tr>
          )
        })}
      </Table.Tbody>
    </Table>
  )
}

function SettleTab({ summary, expenses, settlements, members, author, tour, canEdit, currentUserId, onManualRecord }) {
  if (!summary || expenses.length === 0) {
    return (
      <Card padding="xl" radius="sm" withBorder>
        <Text size="sm" ta="center" c="dimmed">还没有花销，无需结算</Text>
      </Card>
    )
  }

  // Compute net per member: paid - owed + settled_out - settled_in. Matches
  // the server's Expense::Summarize outstanding_net formula so the greedy
  // transfer algorithm only suggests transfers for the REMAINING debt.
  const userRows = [ author, ...members ].reduce((acc, m) => {
    const uid = m.user_id
    if (acc.find((r) => r.user_id === uid)) return acc
    const paid = summary.per_member_paid?.[uid] || 0
    const owed = summary.per_member_owed?.[uid] || 0
    const settledOut = summary.per_member_settled_out?.[uid] || 0
    const settledIn  = summary.per_member_settled_in?.[uid]  || 0
    acc.push({
      user_id: uid,
      email: m.email,
      paid, owed, settledOut, settledIn,
      net: paid - owed + settledOut - settledIn,
    })
    return acc
  }, [])

  const transfers = computeTransfers(userRows.map((r) => [ r.user_id, r.net ]))
  const userLookup = Object.fromEntries(userRows.map((r) => [ r.user_id, r.email ]))

  const markPaid = (transfer) => {
    modals.openConfirmModal({
      title: '这笔转账已完成？',
      children: (
        <Text size="sm">
          {userLookup[transfer.from]} → {userLookup[transfer.to]}{' '}
          <Text component="span" fw={700}>{formatCents(transfer.amount, tour.currency)}</Text>
          ，登记为已结清。
        </Text>
      ),
      labels: { confirm: '已结', cancel: '取消' },
      onConfirm: () => postSettlement(transfer),
    })
  }

  const postSettlement = (transfer) => {
    router.post(`/tours/${tour.id}/settlements`, {
      settlement: {
        from_user_id: transfer.from,
        to_user_id: transfer.to,
        amount_cents: transfer.amount,
      },
    }, {
      preserveScroll: true,
      only: [ 'expenses_summary', 'settlements', 'flash' ],
      onSuccess: (page) => {
        const alert = page?.props?.flash?.alert
        if (alert) notifications.show({ message: alert, color: 'red' })
        else notifications.show({ message: '已登记转账', color: 'green' })
      },
      onError: () => notifications.show({ message: '登记失败', color: 'red' }),
    })
  }

  const undoSettlement = (settlementId) => {
    modals.openConfirmModal({
      title: '撤销这笔结算？',
      children: <Text size="sm">撤销后这笔转账会回到"待结算"列表。</Text>,
      labels: { confirm: '撤销', cancel: '取消' },
      confirmProps: { color: 'red' },
      onConfirm: () => {
        router.delete(`/settlements/${settlementId}`, {
          preserveScroll: true,
          only: [ 'expenses_summary', 'settlements', 'flash' ],
          onSuccess: () => notifications.show({ message: '已撤销', color: 'green' }),
          onError: () => notifications.show({ message: '撤销失败', color: 'red' }),
        })
      },
    })
  }

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Text fw={600} size="sm">每个人应收 / 应付</Text>
        <Button size="compact-xs" variant="light" leftSection={<IconPlus size={12} />} onClick={onManualRecord}>
          记一笔结算
        </Button>
      </Group>
      <Stack gap="xs">
        {userRows.map((r) => (
          <Card key={r.user_id} padding="sm" radius="sm" withBorder
                style={{ borderLeft: `3px solid ${r.net > 0 ? '#2b8a3e' : r.net < 0 ? '#c92a2a' : '#888'}` }}>
            <Group justify="space-between">
              <div>
                <Text size="sm" fw={500}>{r.email}</Text>
                <Text size="xs" c="dimmed">
                  垫了 {formatCents(r.paid, tour.currency)} · 该承担 {formatCents(r.owed, tour.currency)}
                  {(r.settledOut > 0 || r.settledIn > 0) && (
                    <> · 已结 +{formatCents(r.settledOut, tour.currency)} / -{formatCents(r.settledIn, tour.currency)}</>
                  )}
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
                <Group justify="space-between" wrap="nowrap">
                  <Text size="sm" style={{ flex: 1, minWidth: 0 }} truncate>
                    <span>{userLookup[t.from] || '?'}</span>
                    <Text component="span" c="#1677ff" mx="xs" fw={700}>→</Text>
                    <span>{userLookup[t.to] || '?'}</span>
                  </Text>
                  <Group gap="xs" wrap="nowrap">
                    <Text fw={700}>{formatCents(t.amount, tour.currency)}</Text>
                    {/* Any party to the transfer can mark it settled — this is
                        their own money, not a coordinator-only action.
                        Neutral copy ("这笔已结") reads correctly from BOTH
                        payer and receiver POV; "标记已付" was confusing for
                        the receiver. */}
                    {(currentUserId === t.from || currentUserId === t.to) && (
                      <Button size="compact-xs" variant="light" onClick={() => markPaid(t)}>
                        这笔已结
                      </Button>
                    )}
                  </Group>
                </Group>
              </Card>
            ))}
          </Stack>
        </>
      )}

      {settlements.length > 0 && (
        <>
          <Divider my="sm" label="已登记的转账" labelPosition="left" />
          <Stack gap="xs">
            {settlements.map((s) => (
              <Card key={s.id} padding="sm" radius="sm" withBorder style={{ background: '#f8f9fa' }}>
                <Group justify="space-between" wrap="nowrap">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text size="sm" truncate>
                      <span>{userLookup[s.from_user_id] || '?'}</span>
                      <Text component="span" c="dimmed" mx="xs">→</Text>
                      <span>{userLookup[s.to_user_id] || '?'}</span>
                    </Text>
                    <Text size="xs" c="dimmed">{new Date(s.settled_at).toLocaleString('zh-CN')}</Text>
                  </div>
                  <Group gap="xs" wrap="nowrap">
                    <Text fw={600}>{formatCents(s.amount_cents, tour.currency)}</Text>
                    {/* Undo is allowed for the recorder, either party, or any
                        tour editor. Readers who were uninvolved just observe. */}
                    {(canEdit
                      || s.from_user_id === currentUserId
                      || s.to_user_id === currentUserId
                      || s.recorded_by_id === currentUserId) && (
                      <Button size="compact-xs" variant="subtle" color="red" onClick={() => undoSettlement(s.id)}>
                        撤销
                      </Button>
                    )}
                  </Group>
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
