import { useEffect, useRef, useState } from 'react'
import {
  Stack, Group, ActionIcon, Text, Title, Button, Paper, TextInput, NumberInput,
  Drawer as MantineDrawer, ScrollArea,
} from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import { useMediaQuery } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { modals } from '@mantine/modals'
import { IconX, IconAlertOctagonFilled, IconAlertTriangleFilled } from '@tabler/icons-react'
import { router } from '@inertiajs/react'
import * as Sentry from '@sentry/react'
import ParameterEditor from './ParameterEditor'
import RedHeaderDocument from './RedHeaderDocument'
import ConstitutionFullText from './ConstitutionFullText'
import {
  postJson, formatDateISO, todayLocal, detectDateDaysConflict, parseTourDateRange,
} from './tourSetupHelpers'

const DRAWER_MIN = 320
const DRAWER_MAX = 640
const MOBILE_QUERY = '(max-width: 48em)'

// Keep in sync with ParameterEditor's "关键约束" section.
const KEY_FIELDS = ['max_daily_driving_minutes', 'max_tier_one_per_day', 'min_buffer_days']

function onboardedKey(tourId) {
  return `onboarded:tour:${tourId}`
}

function isOnboarded(tour) {
  if (tour?.constitution_accepted) return true
  if (typeof window !== 'undefined' && localStorage.getItem(onboardedKey(tour.id)) === '1') return true
  return false
}

export default function ConstitutionDrawer({
  tour, violations, defaults, overrides = [], initialDaysCount = 1,
  canEdit = true,
  width, onWidthChange, onClose, onFix, onAcknowledge,
}) {
  const onboarded = isOnboarded(tour)
  const isMobile = useMediaQuery(MOBILE_QUERY)
  const drawerRef = useRef(null)

  // Onboarding mode forbids dismissal until the user completes "同意并开始
  // 规划" — the drawer hides its × button, ignores ESC, and Mantine Drawer
  // (mobile) disables its own closeOn* shortcuts.
  const canDismiss = onboarded

  // Constitution params state.
  const [c, setC] = useState({ ...tour.constitution })
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const advancedCount = Object.keys(defaults || {}).filter(k => !KEY_FIELDS.includes(k)).length

  // Soft violations the user has dismissed ("知道了") during this drawer
  // session. Session-only — next time the drawer re-mounts, all violations
  // reappear. Mirrors the original ConstitutionChip behavior.
  const [dismissedSoft, setDismissedSoft] = useState(() => new Set())
  const visibleViolations = violations.filter((v, i) =>
    v.level === 'hard' || !dismissedSoft.has(`${v.rule}:${i}`)
  )
  const dismissSoft = (v, i) => {
    setDismissedSoft(prev => {
      const next = new Set(prev)
      next.add(`${v.rule}:${i}`)
      return next
    })
  }

  // Tour metadata state (onboarding only).
  const [tourTitle, setTourTitle] = useState(tour.title || '')
  const [tourDateRange, setTourDateRange] = useState(() => parseTourDateRange(tour.date_range))
  const [tourTeamSize, setTourTeamSize] = useState(tour.team_size || '')
  const [tourDays, setTourDays] = useState(initialDaysCount || 1)

  // Setup / review state.
  const [setupStep, setSetupStep] = useState(1)
  const [isSaving, setIsSaving] = useState(false)
  const [isAccepting, setIsAccepting] = useState(false)
  // Edit-mode sub-state: false = Review (read-only 《本程宪法》 + 修宪 button),
  // true = Editing (params editable + 取消/保存 explicit). Modeled after the
  // original Tour/Constitution review flow — saving the constitution is a
  // deliberate, ritualized act, not a background autosave.
  const [editing, setEditing] = useState(false)

  // Date/days conflict confirmation modal (matches old Constitution page).
  const askConflict = ({ implied, current, onUseRange, onUseDays }) => {
    modals.openConfirmModal({
      title: '日期范围和天数对不上',
      children: (
        <Text size="sm">
          你选的是 <b>{implied}</b> 天的日期范围，但当前"天数"填的是 <b>{current}</b>。选一个继续：
        </Text>
      ),
      labels: { confirm: `按日期改为 ${implied} 天`, cancel: `保持 ${current} 天，截断日期` },
      onConfirm: onUseRange,
      onCancel: onUseDays,
    })
  }

  const handleDateRangeChange = (newRange) => {
    const [start, end] = newRange || [null, null]
    if (!start || !end) {
      setTourDateRange(newRange)
      return
    }
    const conflict = detectDateDaysConflict(newRange, tourDays)
    if (!conflict) {
      setTourDateRange(newRange)
      const implied = Math.round(
        (new Date(end).getTime() - new Date(start).getTime()) / 86400000,
      ) + 1
      if (implied > 0) setTourDays(implied)
      return
    }
    askConflict({
      implied: conflict.implied,
      current: conflict.current,
      onUseRange: () => {
        setTourDateRange(newRange)
        setTourDays(conflict.implied)
      },
      onUseDays: () => {
        const truncatedEnd = new Date(
          new Date(start).getTime() + (conflict.current - 1) * 86400000,
        )
        setTourDateRange([start, truncatedEnd])
      },
    })
  }

  const handleDaysChange = (val) => {
    const [start, end] = tourDateRange || [null, null]
    if (!start || !val || val <= 0) {
      setTourDays(val)
      return
    }
    if (!end) {
      setTourDays(val)
      const newEnd = new Date(new Date(start).getTime() + (val - 1) * 86400000)
      setTourDateRange([start, newEnd])
      return
    }
    const conflict = detectDateDaysConflict([start, end], val)
    if (!conflict) {
      setTourDays(val)
      return
    }
    askConflict({
      implied: conflict.implied,
      current: val,
      onUseRange: () => setTourDays(conflict.implied),
      onUseDays: () => {
        setTourDays(val)
        const newEnd = new Date(new Date(start).getTime() + (val - 1) * 86400000)
        setTourDateRange([start, newEnd])
      },
    })
  }

  // ESC — scoped to drawer element so nested Select dropdowns get first
  // dibs on the key. Onboarding mode ignores ESC (canDismiss=false).
  useEffect(() => {
    const el = drawerRef.current
    if (!el) return
    const handler = (e) => {
      if (e.key !== 'Escape') return
      if (e.defaultPrevented) return
      if (!canDismiss) return
      onClose()
    }
    el.addEventListener('keydown', handler)
    return () => el.removeEventListener('keydown', handler)
  }, [onClose, canDismiss])

  const onResizeStart = (e) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = width
    const onMove = (ev) => {
      const delta = ev.clientX - startX
      const next = Math.max(DRAWER_MIN, Math.min(DRAWER_MAX, startW + delta))
      onWidthChange(next)
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // Onboarding step 1 save: tour metadata + constitution params + create days.
  const saveStep1 = async () => {
    if (!tourTitle.trim()) {
      notifications.show({ message: '请先填写程名', color: 'red' })
      return
    }
    if (isSaving) return
    setIsSaving(true)
    try {
      const [startDate, endDate] = tourDateRange
      const s = formatDateISO(startDate)
      const e = formatDateISO(endDate)
      const dateRangeStr = (s && e) ? `${s} ~ ${e}` : null

      const newTitle = tourTitle.trim()
      await postJson(`/tours/${tour.id}`, 'PATCH', {
        tour: {
          title: newTitle,
          date_range: dateRangeStr,
          team_size: tourTeamSize || null,
        },
      })
      await postJson(`/tours/${tour.id}/constitution`, 'PATCH', { constitution: c })

      const currentDayCount = initialDaysCount || 1
      const targetDayCount = tourDays || 1
      for (let i = currentDayCount + 1; i <= targetDayCount; i++) {
        await postJson(`/tours/${tour.id}/days`, 'POST', { day: { day_index: i } })
      }

      // Sync browser title immediately — saveStep1 uses fetch (not Inertia)
      // so tour props aren't reloaded; the AppShell header observes <title>
      // mutations to keep its display fresh.
      if (typeof document !== 'undefined') document.title = newTitle

      setSetupStep(2)
    } catch (err) {
      notifications.show({ message: `保存失败：${err.message}`, color: 'red' })
      Sentry.captureException(err, {
        tags: { area: 'tour_setup', op: 'save_params' },
        extra: { tour_id: tour.id },
      })
    } finally {
      setIsSaving(false)
    }
  }

  const acceptConstitution = () => {
    setIsAccepting(true)
    router.post(`/tours/${tour.id}/constitution/accept`, {}, {
      preserveScroll: true,
      onSuccess: () => {
        localStorage.setItem(onboardedKey(tour.id), '1')
        notifications.show({
          message: '旅程已启动 · 从左侧候选池开始加点',
          color: 'green',
          autoClose: 4000,
        })
        onClose()
      },
      onFinish: () => setIsAccepting(false),
    })
  }

  // Review → Editing: enter editing sub-state.
  // Editing → Review: either save (explicit PATCH + exit editing) or cancel
  // (reset `c` back to saved snapshot + exit editing). There is no autosave.
  const saveEdits = () => {
    router.patch(`/tours/${tour.id}/constitution`, { constitution: c }, {
      preserveScroll: true,
      onSuccess: () => {
        setEditing(false)
        notifications.show({ message: '宪法已更新', color: 'green', autoClose: 3000 })
      },
    })
  }
  const cancelEdits = () => {
    setC({ ...tour.constitution })
    setEditing(false)
  }

  const dirty = Object.keys(defaults || {}).some(k => String(c[k]) !== String(defaults[k]))
  const constitutionDirty = JSON.stringify(c) !== JSON.stringify(tour.constitution)
  const resetToDefaults = () => {
    if (!dirty) return
    const changedCount = Object.keys(defaults)
      .filter(k => String(c[k]) !== String(defaults[k])).length
    modals.openConfirmModal({
      title: '恢复默认参数？',
      children: (
        <Text size="sm">恢复默认会丢弃你已修改的 {changedCount} 个参数，确认吗？</Text>
      ),
      labels: { confirm: '恢复默认', cancel: '取消' },
      confirmProps: { color: 'red' },
      onConfirm: () => setC({ ...defaults }),
    })
  }

  // ---- Rendered content (shared by desktop-push and mobile-Drawer paths) ----

  const header = (
    <Group justify="space-between" px="md" py="xs" style={{ borderBottom: '1px solid #eee' }}>
      <Title order={5}>{onboarded ? '宪法' : '设置这次旅程'}</Title>
      {canDismiss && (
        <ActionIcon onClick={onClose} variant="subtle" aria-label="关闭">
          <IconX size={18} />
        </ActionIcon>
      )}
    </Group>
  )

  // Violations list — hidden in onboarding (premature before accept); also
  // hidden while the user is actively editing constitution params (the
  // violations are computed against the SAVED constitution, not the draft,
  // so the list would be misleading during edit).
  const violationList = onboarded && !editing && visibleViolations.length > 0 && (
    <Stack gap="xs">
      {visibleViolations.map((v, i) => {
        const isHard = v.level === 'hard'
        return (
          <Paper
            key={`${v.rule}:${i}`}
            p="xs"
            withBorder
            style={{
              borderColor: isHard ? '#c33' : '#c80',
              background: isHard ? '#fef0f0' : '#fef8e8',
              color: isHard ? '#c33' : '#c80',
            }}
          >
            <Group justify="space-between" wrap="nowrap" gap="xs">
              <Group gap={6} wrap="nowrap">
                {isHard
                  ? <IconAlertOctagonFilled size={14} />
                  : <IconAlertTriangleFilled size={14} />}
                <Text size="sm">{v.message}</Text>
              </Group>
              <Group gap="xs">
                {isHard && (
                  <Button size="compact-xs" color="red" onClick={() => onFix(v)}>帮我修正 →</Button>
                )}
                <Button
                  size="compact-xs"
                  variant="default"
                  onClick={() => (isHard ? onAcknowledge(v) : dismissSoft(v, i))}
                >
                  {isHard ? '承认此违反' : '知道了'}
                </Button>
              </Group>
            </Group>
          </Paper>
        )
      })}
    </Stack>
  )

  // Body sections are pure content (no action buttons). The CTA rows for
  // each state are rendered separately as a sticky footer below the
  // ScrollArea so users always see the primary action without scrolling
  // past a long constitution document.
  const reviewContent = (
    <RedHeaderDocument>
      <ConstitutionFullText constitution={tour.constitution} defaults={defaults} />
    </RedHeaderDocument>
  )

  const editingContent = (
    <ParameterEditor
      c={c}
      setC={setC}
      dirty={dirty}
      advancedOpen={advancedOpen}
      setAdvancedOpen={setAdvancedOpen}
      advancedCount={advancedCount}
      resetToDefaults={resetToDefaults}
    />
  )

  const onboardingStep1Content = (
    <>
      <Text size="xs" c="dimmed" ta="center">第 1 步（共 2 步）</Text>
      <TextInput
        label="程名"
        placeholder="例如：伊犁环线 10 日"
        value={tourTitle}
        onChange={(e) => setTourTitle(e.currentTarget.value)}
        required
      />
      <Group grow>
        <DatePickerInput
          type="range"
          label="日期范围"
          placeholder="出发 ~ 返回"
          value={tourDateRange}
          onChange={handleDateRangeChange}
          valueFormat="YYYY-MM-DD"
          minDate={todayLocal()}
          clearable
        />
        <NumberInput
          label="人数"
          placeholder="例：5"
          value={tourTeamSize}
          onChange={setTourTeamSize}
          min={1}
          max={50}
        />
        <NumberInput
          label="天数"
          placeholder="例：7"
          value={tourDays}
          onChange={handleDaysChange}
          min={1}
          max={30}
        />
      </Group>
      <ParameterEditor
        c={c}
        setC={setC}
        dirty={dirty}
        advancedOpen={advancedOpen}
        setAdvancedOpen={setAdvancedOpen}
        advancedCount={advancedCount}
        resetToDefaults={resetToDefaults}
      />
    </>
  )

  const onboardingStep2Content = (
    <>
      <Text size="xs" c="dimmed" ta="center">第 2 步（共 2 步）· 请阅读后同意</Text>
      <RedHeaderDocument>
        <ConstitutionFullText constitution={c} defaults={defaults} />
      </RedHeaderDocument>
    </>
  )

  const scrollableBody = (
    <Stack gap="md" p="md">
      {violationList}
      {onboarded
        ? (editing ? editingContent : reviewContent)
        : (setupStep === 1 ? onboardingStep1Content : onboardingStep2Content)}
    </Stack>
  )

  // Sticky footer CTA — state-specific. null if no action applies (e.g.
  // review mode for read-only users).
  let footerCta = null
  if (onboarded) {
    if (editing) {
      footerCta = (
        <Group justify="flex-end">
          <Button variant="default" onClick={cancelEdits}>取消</Button>
          <Button onClick={saveEdits} disabled={!constitutionDirty}>保存</Button>
        </Group>
      )
    } else if (canEdit) {
      footerCta = (
        <Group justify="center">
          <Button variant="light" color="red" onClick={() => setEditing(true)}>修宪</Button>
        </Group>
      )
    }
  } else if (setupStep === 1) {
    footerCta = (
      <Group justify="flex-end">
        <Button onClick={saveStep1} loading={isSaving} disabled={isSaving}>
          {isSaving ? '保存中…' : '下一步 →'}
        </Button>
      </Group>
    )
  } else {
    footerCta = (
      <Group justify="center">
        <Button variant="default" onClick={() => setSetupStep(1)}>← 返回修改</Button>
        <Button color="red" onClick={acceptConstitution} loading={isAccepting} disabled={isAccepting}>
          同意并开始规划 →
        </Button>
      </Group>
    )
  }
  const stickyFooter = footerCta && (
    <div
      style={{
        flexShrink: 0,
        padding: '12px 16px',
        borderTop: '1px solid #eee',
        background: '#fff',
      }}
    >
      {footerCta}
    </div>
  )

  // Mobile: render as floating Mantine Drawer (push would squash planner).
  if (isMobile) {
    return (
      <MantineDrawer
        opened
        onClose={onClose}
        position="left"
        size="90%"
        withCloseButton={false}
        padding={0}
        closeOnEscape={canDismiss}
        closeOnClickOutside={canDismiss}
        data-testid="constitution-drawer-mobile"
      >
        <div ref={drawerRef} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {header}
          <ScrollArea style={{ flex: 1 }}>{scrollableBody}</ScrollArea>
          {stickyFooter}
        </div>
      </MantineDrawer>
    )
  }

  // Desktop: push-style aside (flex sibling of planner panels).
  // flexShrink: 0 pins the width to `width`; without it the flex container
  // would shrink the aside below its declared width when panels compete for
  // space — we observed drawer width=400 rendering as ~332px at 1440vw.
  return (
    <aside
      ref={drawerRef}
      style={{
        width,
        minWidth: DRAWER_MIN,
        maxWidth: DRAWER_MAX,
        flexShrink: 0,
        borderRight: '1px solid #e0e0e0',
        background: '#fff',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        height: '100%',
      }}
      data-testid="constitution-drawer"
      tabIndex={-1}
    >
      {header}
      <ScrollArea style={{ flex: 1 }}>{scrollableBody}</ScrollArea>
      {stickyFooter}
      <div
        onMouseDown={onResizeStart}
        style={{
          position: 'absolute',
          top: 0,
          right: -4,
          width: 8,
          height: '100%',
          cursor: 'col-resize',
          zIndex: 10,
        }}
        data-testid="constitution-resize-handle"
      />
    </aside>
  )
}
