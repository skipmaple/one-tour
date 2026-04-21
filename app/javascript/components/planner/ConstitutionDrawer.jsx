import { useEffect, useRef, useState } from 'react'
import {
  Stack, Group, ActionIcon, Text, Title, Button, Paper, TextInput, NumberInput,
  Drawer as MantineDrawer, ScrollArea, Box,
} from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import { useMediaQuery } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { modals } from '@mantine/modals'
import { IconX, IconAlertOctagonFilled, IconAlertTriangleFilled } from '@tabler/icons-react'
import { router } from '@inertiajs/react'
import debounce from 'lodash.debounce'
import * as Sentry from '@sentry/react'
import ParameterEditor from './ParameterEditor'
import RedHeaderDocument from './RedHeaderDocument'
import ConstitutionFullText from './ConstitutionFullText'
import {
  postJson, formatDateISO, todayLocal, detectDateDaysConflict, parseTourDateRange,
} from './tourSetupHelpers'

const DRAWER_MIN = 320
const DRAWER_MAX = 640
const SAVE_DEBOUNCE_MS = 500
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
  width, onWidthChange, onClose, onFix, onAcknowledge,
}) {
  const onboarded = isOnboarded(tour)
  const isMobile = useMediaQuery(MOBILE_QUERY)
  const drawerRef = useRef(null)

  // Constitution params state.
  const [c, setC] = useState({ ...tour.constitution })
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const advancedCount = Object.keys(defaults || {}).filter(k => !KEY_FIELDS.includes(k)).length

  // Tour metadata state (onboarding only).
  const [tourTitle, setTourTitle] = useState(tour.title || '')
  const [tourDateRange, setTourDateRange] = useState(() => parseTourDateRange(tour.date_range))
  const [tourTeamSize, setTourTeamSize] = useState(tour.team_size || '')
  const [tourDays, setTourDays] = useState(initialDaysCount || 1)

  // Step and save state.
  const [setupStep, setSetupStep] = useState(1)
  const [isSaving, setIsSaving] = useState(false)
  const [isAccepting, setIsAccepting] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState(null)

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

  // Edit-mode debounced auto-save.
  const debouncedPatchRef = useRef(null)
  useEffect(() => {
    debouncedPatchRef.current = debounce((constitution) => {
      router.patch(`/tours/${tour.id}/constitution`, { constitution }, {
        preserveScroll: true,
        onSuccess: () => setLastSavedAt(new Date()),
      })
    }, SAVE_DEBOUNCE_MS)
    return () => debouncedPatchRef.current?.cancel?.()
  }, [tour.id])

  const isInitialRender = useRef(true)
  useEffect(() => {
    if (!onboarded) return
    if (isInitialRender.current) {
      isInitialRender.current = false
      return
    }
    debouncedPatchRef.current?.(c)
  }, [c, onboarded])

  // ESC closes — scoped to the drawer element so a nested Select's dropdown
  // gets first dibs on the key (prevents closing the whole drawer when the
  // user only wanted to dismiss a dropdown).
  useEffect(() => {
    const el = drawerRef.current
    if (!el) return
    const handler = (e) => {
      if (e.key !== 'Escape') return
      if (e.defaultPrevented) return
      onClose()
    }
    el.addEventListener('keydown', handler)
    return () => el.removeEventListener('keydown', handler)
  }, [onClose])

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

      await postJson(`/tours/${tour.id}`, 'PATCH', {
        tour: {
          title: tourTitle.trim(),
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

  const dirty = Object.keys(defaults || {}).some(k => String(c[k]) !== String(defaults[k]))
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
      <ActionIcon onClick={onClose} variant="subtle" aria-label="关闭">
        <IconX size={18} />
      </ActionIcon>
    </Group>
  )

  // Violations list — hidden in onboarding mode (user hasn't accepted yet,
  // warnings would be premature and noisy).
  const violationList = onboarded && violations.length > 0 && (
    <Stack gap="xs">
      {violations.map((v, i) => {
        const isHard = v.level === 'hard'
        return (
          <Paper
            key={i}
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
                  onClick={() => (isHard ? onAcknowledge(v) : undefined)}
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

  const editModeBody = (
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

  const onboardingStep1 = (
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
      <Group justify="flex-end">
        <Button onClick={saveStep1} loading={isSaving} disabled={isSaving}>
          {isSaving ? '保存中…' : '下一步 →'}
        </Button>
      </Group>
    </>
  )

  const onboardingStep2 = (
    <>
      <Text size="xs" c="dimmed" ta="center">第 2 步（共 2 步）· 请阅读后同意</Text>
      <RedHeaderDocument>
        <ConstitutionFullText constitution={c} defaults={defaults} />
      </RedHeaderDocument>
      <Group justify="center">
        <Button variant="default" onClick={() => setSetupStep(1)}>← 返回修改</Button>
        <Button color="red" onClick={acceptConstitution} loading={isAccepting} disabled={isAccepting}>
          同意并开始规划 →
        </Button>
      </Group>
    </>
  )

  const bodyContent = (
    <Stack gap="md" p="md">
      {violationList}
      {onboarded ? editModeBody : setupStep === 1 ? onboardingStep1 : onboardingStep2}
    </Stack>
  )

  const footer = onboarded && (
    <Box style={{ borderTop: '1px solid #eee' }}>
      <Text size="xs" c="dimmed" ta="center" py={4}>
        {lastSavedAt
          ? `已保存 · ${lastSavedAt.toLocaleTimeString('zh-CN')}`
          : '所有更改将自动保存'}
      </Text>
    </Box>
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
        data-testid="constitution-drawer-mobile"
      >
        <div ref={drawerRef} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {header}
          <ScrollArea style={{ flex: 1 }}>{bodyContent}</ScrollArea>
          {footer}
        </div>
      </MantineDrawer>
    )
  }

  // Desktop: push-style aside (flex sibling of planner panels).
  return (
    <aside
      ref={drawerRef}
      style={{
        width,
        minWidth: DRAWER_MIN,
        maxWidth: DRAWER_MAX,
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
      <ScrollArea style={{ flex: 1 }}>{bodyContent}</ScrollArea>
      {footer}
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
