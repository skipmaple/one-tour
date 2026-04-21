import { useEffect, useRef, useState } from 'react'
import { Stack, Group, ActionIcon, Text, Title, Button, Paper } from '@mantine/core'
import { IconX, IconAlertOctagonFilled, IconAlertTriangleFilled } from '@tabler/icons-react'
import { router } from '@inertiajs/react'
import debounce from 'lodash.debounce'
import ParameterEditor from './ParameterEditor'
import RedHeaderDocument from './RedHeaderDocument'
import ConstitutionFullText from './ConstitutionFullText'

const DRAWER_MIN = 320
const DRAWER_MAX = 640
const SAVE_DEBOUNCE_MS = 500

function onboardedKey(tourId) {
  return `onboarded:tour:${tourId}`
}

function isOnboarded(tour) {
  if (tour?.constitution_accepted) return true
  if (typeof window !== 'undefined' && localStorage.getItem(onboardedKey(tour.id)) === '1') return true
  return false
}

export default function ConstitutionDrawer({
  tour, violations, defaults, overrides = [],
  width, onWidthChange, onClose, onFix, onAcknowledge,
}) {
  const onboarded = isOnboarded(tour)
  const [c, setC] = useState({ ...tour.constitution })
  const [lastSavedAt, setLastSavedAt] = useState(null)
  const [setupStep, setSetupStep] = useState(1)
  const [isAccepting, setIsAccepting] = useState(false)

  // Debounced PATCH for edit-mode auto-save. Stable ref so debounce timer
  // isn't recreated on every keystroke.
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

  // Edit-mode only: every change to `c` triggers a debounced save. The initial
  // render shouldn't fire a save (c starts equal to tour.constitution).
  const isInitialRender = useRef(true)
  useEffect(() => {
    if (!onboarded) return
    if (isInitialRender.current) {
      isInitialRender.current = false
      return
    }
    debouncedPatchRef.current?.(c)
  }, [c, onboarded])

  // ESC closes.
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Resize via the right edge handle.
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

  const saveStep1 = () => {
    router.patch(`/tours/${tour.id}/constitution`, { constitution: c }, {
      preserveScroll: true,
      onSuccess: () => setSetupStep(2),
    })
  }

  const acceptConstitution = () => {
    setIsAccepting(true)
    router.post(`/tours/${tour.id}/constitution/accept`, {}, {
      preserveScroll: true,
      onSuccess: () => {
        localStorage.setItem(onboardedKey(tour.id), '1')
        onClose()
      },
      onFinish: () => setIsAccepting(false),
    })
  }

  return (
    <aside
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
    >
      <Group justify="space-between" px="md" py="xs" style={{ borderBottom: '1px solid #eee' }}>
        <Title order={5}>{onboarded ? '宪法' : '设置这次旅程'}</Title>
        <ActionIcon onClick={onClose} variant="subtle" aria-label="关闭">
          <IconX size={18} />
        </ActionIcon>
      </Group>

      <Stack gap="md" p="md" style={{ overflowY: 'auto', flex: 1 }}>
        {violations.length > 0 && (
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
        )}

        {onboarded ? (
          // Edit mode: live editable with debounced auto-save
          <ParameterEditor
            c={c}
            setC={setC}
            dirty={JSON.stringify(c) !== JSON.stringify(tour.constitution)}
            advancedOpen={false}
            setAdvancedOpen={() => {}}
            advancedCount={0}
            resetToDefaults={() => setC({ ...defaults })}
          />
        ) : setupStep === 1 ? (
          // Onboarding step 1: edit params
          <>
            <Text size="xs" c="dimmed" ta="center">第 1 步（共 2 步）</Text>
            <ParameterEditor
              c={c}
              setC={setC}
              dirty={JSON.stringify(c) !== JSON.stringify(tour.constitution)}
              advancedOpen={false}
              setAdvancedOpen={() => {}}
              advancedCount={0}
              resetToDefaults={() => setC({ ...defaults })}
            />
            <Group justify="flex-end">
              <Button onClick={saveStep1}>下一步 →</Button>
            </Group>
          </>
        ) : (
          // Onboarding step 2: review + accept
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
        )}
      </Stack>

      {onboarded && lastSavedAt && (
        <Text size="xs" c="dimmed" ta="center" py={4} style={{ borderTop: '1px solid #eee' }}>
          已保存 · {lastSavedAt.toLocaleTimeString('zh-CN')}
        </Text>
      )}

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
