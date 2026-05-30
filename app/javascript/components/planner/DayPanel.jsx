import { Paper, Stack, Text, Button, UnstyledButton } from '@mantine/core'
import { router } from '@inertiajs/react'
import { IconCalendarEvent, IconArrowAutofitWidth } from '@tabler/icons-react'
import PanelShell from './PanelLayout/PanelShell'
import DayColumn from './DayColumn'

const DAY_STRIP_BACKGROUND = `
  linear-gradient(to right, white, white),
  linear-gradient(to left, white, white),
  linear-gradient(to right, rgba(0,0,0,0.1), rgba(0,0,0,0)),
  linear-gradient(to left, rgba(0,0,0,0.1), rgba(0,0,0,0))
`

export default function DayPanel({
  days,
  byDay,
  tour,
  nextDayIndex,
  open,
  onToggle,
  canToggle,
  autoFit,
  onToggleAutoFit,
  flexStyle,
  onAddActivity,
  onEditActivity,
  onCardContextMenu,
  onEditDay,
  readOnly,
  dragWarning,
  routeLegs,
  hoveredActivityIds,
  onHoverActivity,
  onHoverConnector,
  onClearHover,
  author,
  members,
  filterActive = false,
}) {
  const autoFitButton = (
    <UnstyledButton
      onClick={onToggleAutoFit}
      aria-label="auto-fit toggle"
      data-active={autoFit ? 'true' : 'false'}
      style={{
        background: autoFit ? '#0071e3' : '#fff',
        color: autoFit ? '#fff' : '#666',
        border: autoFit ? 'none' : '1px solid #ddd',
        fontSize: 10,
        padding: '2px 7px',
        borderRadius: 3,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
      }}
    >
      <IconArrowAutofitWidth size={12} stroke={1.75} />
      {autoFit ? '自适应' : '恢复'}
    </UnstyledButton>
  )

  return (
    <PanelShell
      title="日程"
      icon={<IconCalendarEvent size={14} stroke={1.5} />}
      open={open}
      onToggle={onToggle}
      canToggle={canToggle}
      flexStyle={flexStyle}
      headerExtra={autoFitButton}
    >
      <div style={{
        display: 'flex',
        gap: 8,
        overflowX: 'auto',
        alignItems: 'stretch',
        padding: 8,
        flex: 1,
        background: DAY_STRIP_BACKGROUND,
        backgroundPosition: 'left center, right center, left center, right center',
        backgroundSize: '20px 100%, 20px 100%, 10px 100%, 10px 100%',
        backgroundRepeat: 'no-repeat',
        backgroundAttachment: 'local, local, scroll, scroll',
      }}>
        {days.map(d => (
          <DayColumn
            key={d.id}
            day={d}
            activities={byDay[d.id] || []}
            constitution={tour.constitution}
            onAddActivity={onAddActivity}
            onEditActivity={onEditActivity}
            onCardContextMenu={onCardContextMenu}
            onEditDay={onEditDay}
            readOnly={readOnly}
            dragWarning={dragWarning?.dayId === d.id ? dragWarning : null}
            routeLegs={routeLegs}
            hoveredActivityIds={hoveredActivityIds}
            onHoverActivity={onHoverActivity}
            onHoverConnector={onHoverConnector}
            onClearHover={onClearHover}
            author={author}
            members={members}
            filterActive={filterActive}
          />
        ))}
        <AddDayButton tour={tour} nextDayIndex={nextDayIndex} empty={days.length === 0} />
      </div>
    </PanelShell>
  )
}

function AddDayButton({ tour, nextDayIndex, empty }) {
  const handleAdd = () => {
    router.post(
      `/tours/${tour.id}/days`,
      { day: { day_index: nextDayIndex } },
      {
        only: ['days', 'activities', 'violations'],
        preserveState: true,
        preserveScroll: true,
      }
    )
  }

  if (empty) {
    return (
      <Paper
        withBorder
        style={{
          minWidth: 260,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          border: '2px dashed #ccc',
          background: '#fafafa',
          padding: 24,
          gap: 8,
        }}
      >
        <Stack gap={6} align="center">
          <Text fw={600} size="sm">还没有日</Text>
          <Text size="xs" c="dimmed" ta="center">
            从第 1 天开始，或让 AI 帮你一次排完
          </Text>
          <Button size="xs" onClick={handleAdd} data-testid="add-day-empty">
            + 新建 D1
          </Button>
        </Stack>
      </Paper>
    )
  }

  return (
    <Paper
      withBorder
      onClick={handleAdd}
      style={{
        minWidth: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        border: '2px dashed #ccc',
        background: '#fafafa',
        color: '#666',
      }}
      data-testid="add-day-slot"
    >
      <Text size="sm" fw={500}>+ D{nextDayIndex}</Text>
    </Paper>
  )
}
