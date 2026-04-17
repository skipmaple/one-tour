import { useState } from 'react'
import { Stack, Group, Title, Button, Paper, Text, Select, Divider, TextInput, NumberInput } from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import { Head, router } from '@inertiajs/react'
import TourTabs from '../../components/tour/TourTabs'
import ConstitutionFullText from '../../components/planner/ConstitutionFullText'

const KEY_FIELDS = [ 'max_daily_driving_minutes', 'max_tier_one_per_day', 'min_buffer_days' ]

export default function Constitution({ tour, constitution, defaults, overrides, is_setup }) {
  const [c, setC] = useState({ ...constitution })
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  // Setup mode: step 1 = parameter editor, step 2 = full text review
  const [setupStep, setSetupStep] = useState(1)
  const [tourTitle, setTourTitle] = useState(tour.title || '')
  const [tourDateRange, setTourDateRange] = useState(() => {
    if (!tour.date_range) return [null, null]
    // Try to parse "YYYY-MM-DD ~ YYYY-MM-DD" or similar stored format
    const parts = tour.date_range.split(/[~\-–—]/).map(s => s.trim()).filter(Boolean)
    if (parts.length === 2) {
      const d1 = new Date(parts[0])
      const d2 = new Date(parts[1])
      if (!isNaN(d1) && !isNaN(d2)) return [d1, d2]
    }
    return [null, null]
  })
  const [tourTeamSize, setTourTeamSize] = useState(tour.team_size || '')
  const [tourDays, setTourDays] = useState(tour.days_count || 1)

  // Bidirectional sync: date range ↔ days count
  const handleDateRangeChange = (range) => {
    setTourDateRange(range)
    const [start, end] = range
    if (start && end) {
      const diffDays = Math.round((end - start) / 86400000) + 1
      if (diffDays > 0) setTourDays(diffDays)
    }
  }

  const handleDaysChange = (val) => {
    setTourDays(val)
    const [start] = tourDateRange
    if (start && val > 0) {
      const newEnd = new Date(start.getTime() + (val - 1) * 86400000)
      setTourDateRange([start, newEnd])
    }
  }

  const dirty = Object.keys(defaults).some(k => String(c[k]) !== String(defaults[k]))
  const advancedCount = Object.keys(defaults).filter(k => !KEY_FIELDS.includes(k)).length

  // Setup mode: save params via fetch (avoid Inertia redirect), then show full text
  const proceedToReview = async () => {
    if (!tourTitle.trim()) return  // prevent empty title
    const token = document.querySelector('meta[name=csrf-token]')?.getAttribute('content') || ''
    // Format date range for backend
    const [startDate, endDate] = tourDateRange
    const dateRangeStr = (startDate && endDate)
      ? `${formatDateISO(startDate)} ~ ${formatDateISO(endDate)}`
      : null
    // Save tour metadata
    await fetch(`/tours/${tour.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-CSRF-Token': token },
      body: JSON.stringify({ tour: { title: tourTitle.trim(), date_range: dateRangeStr, team_size: tourTeamSize || null } })
    })
    // Save constitution params
    await fetch(`/tours/${tour.id}/constitution`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-CSRF-Token': token },
      body: JSON.stringify({ constitution: c })
    })
    // Batch create Days if needed (tour already has 1 Day from seed_first_day)
    const currentDayCount = tour.days_count || 1
    const targetDayCount = tourDays || 1
    if (targetDayCount > currentDayCount) {
      for (let i = currentDayCount + 1; i <= targetDayCount; i++) {
        await fetch(`/tours/${tour.id}/days`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-CSRF-Token': token },
          body: JSON.stringify({ day: { day_index: i } })
        })
      }
    }
    setSetupStep(2)
    window.scrollTo(0, 0)
  }

  // Setup mode step 2: mark accepted, then go to planner
  const agreeAndStart = async () => {
    const token = document.querySelector('meta[name=csrf-token]')?.getAttribute('content') || ''
    await fetch(`/tours/${tour.id}/constitution/accept`, {
      method: 'POST',
      headers: { 'X-CSRF-Token': token }
    })
    router.visit(`/tours/${tour.id}`)
  }

  // Review mode: save and stay on page
  const saveEdits = () => {
    router.patch(`/tours/${tour.id}/constitution`, { constitution: c }, {
      onSuccess: () => setEditing(false)
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
    <div style={{ padding: 10 }}>
      <TourTabs tour={tour} active="constitution" />
      <Stack gap="lg" maw={820} mx="auto" mt="md">
        <Head title="宪法" />

        {is_setup && setupStep === 1 ? (
          // ===== SETUP STEP 1: PARAMETER EDITOR =====
          <>
            <Text size="xs" c="dimmed" ta="center">第 1 步（共 2 步）</Text>
            <Title order={3} ta="center">调整本程参数</Title>
            <Text size="sm" c="dimmed" ta="center">大多数情况下默认值就够用，直接点"下一步"即可</Text>
            <TextInput
              label="程名"
              placeholder="例如：伊犁环线 10 日"
              value={tourTitle}
              onChange={e => setTourTitle(e.currentTarget.value)}
              required
            />
            <Group grow>
              <DatePickerInput
                type="range"
                label="日期范围"
                placeholder="选择出发和返回日期"
                value={tourDateRange}
                onChange={handleDateRangeChange}
                valueFormat="YYYY-MM-DD"
                clearable
              />
              <NumberInput
                label="人数"
                placeholder="例如：5"
                value={tourTeamSize}
                onChange={setTourTeamSize}
                min={1}
                max={50}
              />
              <NumberInput
                label="天数"
                placeholder="例如：7"
                value={tourDays}
                onChange={handleDaysChange}
                min={1}
                max={30}
              />
            </Group>
            <ParameterEditor
              c={c} setC={setC} dirty={dirty} advancedOpen={advancedOpen}
              setAdvancedOpen={setAdvancedOpen} advancedCount={advancedCount}
              resetToDefaults={resetToDefaults}
            />
            <Group justify="space-between" mt="lg" pt="md" style={{ borderTop: '1px solid #eee' }}>
              <Button variant="default" onClick={resetToDefaults} disabled={!dirty}>↺ 恢复默认</Button>
              <Button onClick={proceedToReview}>下一步 →</Button>
            </Group>
          </>

        ) : is_setup && setupStep === 2 ? (
          // ===== SETUP STEP 2: FULL TEXT REVIEW + AGREE =====
          <>
            <Text size="xs" c="dimmed" ta="center">第 2 步（共 2 步）· 请阅读后滚动至底部同意</Text>
            <RedHeaderDocument>
              <ConstitutionFullText constitution={c} />
            </RedHeaderDocument>
            <Group justify="center" pt="lg" pb="md" style={{
              position: 'sticky', bottom: 0, background: '#fff',
              padding: '16px 0', borderTop: '1px solid #eee',
              boxShadow: '0 -2px 8px rgba(0,0,0,0.06)'
            }}>
              <Button variant="default" onClick={() => setSetupStep(1)}>← 返回修改参数</Button>
              <Button color="red" onClick={agreeAndStart}>同意并开始规划 →</Button>
            </Group>
          </>

        ) : editing ? (
          // ===== REVIEW MODE: EDITING =====
          <>
            <Title order={3} ta="center">修改宪法参数</Title>
            <ParameterEditor
              c={c} setC={setC} dirty={dirty} advancedOpen={advancedOpen}
              setAdvancedOpen={setAdvancedOpen} advancedCount={advancedCount}
              resetToDefaults={resetToDefaults}
            />
            <Group justify="space-between" mt="lg" pt="md" style={{ borderTop: '1px solid #eee' }}>
              <Button variant="default" onClick={resetToDefaults} disabled={!dirty}>↺ 恢复默认</Button>
              <Group>
                <Button variant="default" onClick={() => { setC({ ...constitution }); setEditing(false) }}>取消</Button>
                <Button onClick={saveEdits} disabled={!dirty}>保存</Button>
              </Group>
            </Group>
          </>

        ) : (
          // ===== REVIEW MODE: READ-ONLY =====
          <>
            <RedHeaderDocument>
              <ConstitutionFullText constitution={constitution} />
            </RedHeaderDocument>
            <Group justify="center" pt="lg">
              <Button variant="light" color="red" onClick={() => setEditing(true)}>修宪</Button>
            </Group>
          </>
        )}

        {/* Overrides table — show in all modes except setup */}
        {!is_setup && overrides && overrides.length > 0 && (
          <Stack gap="xs" mt="lg" pt="md" style={{ borderTop: '1px solid #eee' }}>
            <Title order={4}>已承认的违反 ({overrides.length})</Title>
            <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>
                  <th style={{ padding: '6px 8px' }}>规则</th>
                  <th style={{ padding: '6px 8px' }}>范围</th>
                  <th style={{ padding: '6px 8px' }}>理由</th>
                  <th style={{ padding: '6px 8px' }}>承认于</th>
                  <th style={{ padding: '6px 8px' }}></th>
                </tr>
              </thead>
              <tbody>
                {overrides.map((o, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '6px 8px' }}><code>{o.rule}</code></td>
                    <td style={{ padding: '6px 8px' }}>{formatScope(o.scope)}</td>
                    <td style={{ padding: '6px 8px' }}>{o.reason}</td>
                    <td style={{ padding: '6px 8px' }}>{formatDate(o.acknowledged_at)}</td>
                    <td style={{ padding: '6px 8px' }}>
                      <Button
                        size="compact-xs"
                        variant="subtle"
                        color="red"
                        onClick={() => {
                          router.delete(`/tours/${tour.id}/overrides`, {
                            data: { rule: o.rule, scope: o.scope },
                            preserveScroll: true,
                            onSuccess: () => router.reload({ only: ['overrides'] }),
                          })
                        }}
                      >
                        撤销
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Stack>
        )}
      </Stack>
    </div>
  )
}

// 红头文件 document wrapper
function RedHeaderDocument({ children }) {
  return (
    <div>
      <div style={{ textAlign: 'center', borderBottom: '2px solid #c00', paddingBottom: 12, marginBottom: 16 }}>
        <div style={{ fontSize: 28, fontWeight: 700, color: '#c00', letterSpacing: 8, fontFamily: '"SimSun", "宋体", serif' }}>
          《本程宪法》
        </div>
      </div>
      {children}
    </div>
  )
}

function ParameterEditor({ c, setC, dirty, advancedOpen, setAdvancedOpen, advancedCount, resetToDefaults }) {
  return (
    <>
      <Stack gap="xs">
        <Title order={4}>关键约束</Title>
        <Text size="xs" c="dimmed">99% 的人只看这 3 条就够</Text>
        <ConstRow label="每天最多驾驶" field="max_daily_driving_minutes" scale={60} options={[240, 300, 360, 420, 480]} unit="小时" hint="防止疲劳驾驶 · 含山路和通勤" c={c} setC={setC} />
        <ConstRow label='每天最多"核心景点"' field="max_tier_one_per_day" options={[1, 2, 3, 4]} unit="个" hint="贪多嚼不烂 · 每个要 1.5-3h 体验" c={c} setC={setC} />
        <ConstRow label="整程至少机动日" field="min_buffer_days" options={[0, 1, 2]} unit="天" hint="应对天气 / 疲劳 / 突发" c={c} setC={setC} />
      </Stack>
      <Button variant="subtle" size="sm" onClick={() => setAdvancedOpen(o => !o)}>
        {advancedOpen ? '▴ 收起高级参数' : `▾ 高级参数（剩余 ${advancedCount} 条，大多数情况不用改）`}
      </Button>
      {advancedOpen && (
        <Stack gap="xs">
          <Title order={5}>硬约束剩余</Title>
          <ConstRow label="单日山路驾驶上限" field="max_mountain_road_minutes" scale={60} options={[180, 240, 300]} unit="小时" hint="独库 / 伊昭这类山路段" c={c} setC={setC} />
          <ConstRow label="每日机动时间下限" field="min_daily_buffer_minutes" options={[60, 90, 120]} unit="分钟" hint="排队 / 拍照 / 临时停靠" c={c} setC={setC} />
          <Title order={5} mt="md">弹性配额</Title>
          <ConstRow label="整程特色餐厅总数" field="max_tier_two_food_per_tour" options={[2, 3, 4]} unit="家" hint="为吃饭绕路的上限" c={c} setC={setC} />
          <ConstRow label='整程"找油紧急升级"' field="max_fuel_emergency_per_tour" options={[0, 1, 2]} unit="次" hint="多于此说明油量规划不好" c={c} setC={setC} />
        </Stack>
      )}
    </>
  )
}

function formatScope(scope) {
  if (!scope || Object.keys(scope).length === 0) return '全局'
  return Object.entries(scope).map(([k, v]) => `${k}=${v}`).join(', ')
}

function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}

function formatDateISO(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
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
    </Group>
  )
}
