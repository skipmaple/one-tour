import { useState, useRef, useCallback, useEffect } from 'react'
import {
  Combobox, TextInput, Loader, Text, Stack, Group, Button, Paper, Badge,
  useCombobox, ActionIcon,
} from '@mantine/core'
import { IconX, IconMapPin } from '@tabler/icons-react'
import LocationPickerMap from './LocationPickerMap'

/**
 * Unified location picker. Supports two modes:
 *
 * mode="single" (default):
 *   value:    { name, lat, lng, address, pname, cityname, adname, type } | null
 *   onChange: (next) => void
 *
 * mode="dual":
 *   value:    { start, end } — each field is a single-mode value or null
 *   onChange: ({ start, end }) => void
 *
 * Shared props (all modes):
 *   regionHint:   string? — city name to bias search (default open, user can close)
 *   nearbyCenter: { lat, lng }? — passed to backend as near_lat/near_lng
 *   disabled:     boolean
 */
export default function LocationPicker({ mode = 'single', value, onChange, ...rest }) {
  if (mode === 'dual') {
    const handleStart = (start) => onChange({ ...value, start })
    const handleEnd   = (end)   => onChange({ ...value, end })
    return (
      <Stack gap="md">
        <div>
          <Text size="sm" fw={500} mb="xs">起点</Text>
          <SingleLocationPicker value={value?.start} onChange={handleStart} {...rest} />
        </div>
        <div>
          <Text size="sm" fw={500} mb="xs">终点</Text>
          <SingleLocationPicker value={value?.end} onChange={handleEnd} {...rest} />
        </div>
      </Stack>
    )
  }
  return <SingleLocationPicker value={value} onChange={onChange} {...rest} />
}

function SingleLocationPicker({ value, onChange, regionHint, nearbyCenter, disabled }) {
  const [query, setQuery] = useState('')
  const [candidates, setCandidates] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [activeRegion, setActiveRegion] = useState(regionHint || null)
  const timerRef = useRef(null)
  const requestIdRef = useRef(0)  // 请求序号，防 out-of-order
  const combobox = useCombobox()

  useEffect(() => { setActiveRegion(regionHint || null) }, [regionHint])

  // Unmount cleanup：清 debounce timer + 让后续 inflight 请求回来时被忽略。
  useEffect(() => {
    return () => {
      clearTimeout(timerRef.current)
      requestIdRef.current = -1  // 后续任何 myId !== -1 比较一律忽略
    }
  }, [])

  const search = useCallback((q) => {
    if (q.trim().length === 0) {
      setCandidates([])
      combobox.closeDropdown()
      return
    }
    setLoading(true); setError(null)
    const params = new URLSearchParams({ q })
    if (activeRegion) params.set('region_hint', activeRegion)
    if (nearbyCenter?.lat) params.set('near_lat', nearbyCenter.lat)
    if (nearbyCenter?.lng) params.set('near_lng', nearbyCenter.lng)

    // 自增 request id；稍慢的老请求回来时 myId < current → 忽略
    requestIdRef.current += 1
    const myId = requestIdRef.current

    fetch(`/poi_search?${params}`)
      .then(res => {
        if (!res.ok) {
          throw new Error(res.status === 429 ? 'RATE_LIMIT' : 'SEARCH_FAILED')
        }
        return res.json()
      })
      .then(data => {
        if (myId !== requestIdRef.current) return  // stale, ignore
        const next = Array.isArray(data?.candidates) ? data.candidates : []
        setCandidates(next)
        if (next.length > 0) combobox.openDropdown()
        else combobox.closeDropdown()
      })
      .catch((err) => {
        if (myId !== requestIdRef.current) return
        setCandidates([])
        combobox.closeDropdown()
        setError(err?.message === 'RATE_LIMIT' ? '搜索太频繁，请稍后重试' : '搜索失败')
      })
      .finally(() => {
        if (myId !== requestIdRef.current) return
        setLoading(false)
      })
  }, [activeRegion, nearbyCenter?.lat, nearbyCenter?.lng, combobox])

  const handleSelect = (idx) => {
    const c = candidates[Number(idx)]
    if (c) {
      onChange({
        name: c.name, lat: c.lat, lng: c.lng, address: c.address || '',
        pname: c.pname, cityname: c.cityname, adname: c.adname, type: c.type
      })
      setQuery('')
      setCandidates([])
    }
    combobox.closeDropdown()
  }

  const handleMapMove = ({ lat, lng }) => {
    if (value) onChange({ ...value, lat, lng })
  }

  const provinceCityDistrict = (c) => [c.pname, c.cityname, c.adname].filter(Boolean).join('·')

  // Selected state: compact summary + map
  if (value) {
    return (
      <Stack gap="xs">
        <Paper withBorder p="sm" data-testid="location-picker-selected">
          <Group justify="space-between" wrap="nowrap" align="flex-start">
            <Stack gap={2}>
              <Text fw={500} size="sm">
                <IconMapPin size={14} style={{ marginRight: 4, verticalAlign: -2 }} />
                {value.name}
              </Text>
              <Text size="xs" c="blue">{provinceCityDistrict(value)}</Text>
              {value.type && <Text size="xs" c="dimmed">{value.type}</Text>}
            </Stack>
            {!disabled && (
              <Button variant="subtle" size="compact-xs" onClick={() => onChange(null)}>重选</Button>
            )}
          </Group>
        </Paper>
        <LocationPickerMap lat={value.lat} lng={value.lng} onMove={handleMapMove} />
        <Text size="xs" c="dimmed">
          坐标 {Number(value.lat).toFixed(4)}, {Number(value.lng).toFixed(4)}
        </Text>
      </Stack>
    )
  }

  // Search state
  return (
    <Stack gap="xs">
      {activeRegion && (
        <Group gap="xs">
          <Badge variant="light" rightSection={
            <ActionIcon
              size="xs" variant="transparent" aria-label="关闭城市过滤"
              onClick={() => setActiveRegion(null)}
            ><IconX size={12} /></ActionIcon>
          }>城市: {activeRegion}</Badge>
        </Group>
      )}
      <Combobox store={combobox} onOptionSubmit={handleSelect} disabled={disabled}>
        <Combobox.Target>
          <TextInput
            placeholder="输入地名搜索..."
            value={query}
            onChange={e => {
              const v = e.currentTarget.value
              setQuery(v)
              clearTimeout(timerRef.current)
              timerRef.current = setTimeout(() => search(v), 300)
            }}
            rightSection={loading ? <Loader size={14} /> : null}
            error={error}
            onFocus={() => { if (candidates.length > 0) combobox.openDropdown() }}
            disabled={disabled}
          />
        </Combobox.Target>
        <Combobox.Dropdown>
          <Combobox.Options>
            {candidates.map((c, i) => (
              <Combobox.Option key={i} value={String(i)}>
                <Text fw={500} size="sm">{c.name}</Text>
                <Text size="xs" c="blue">{provinceCityDistrict(c)}{c.type ? ` · ${c.type}` : ''}</Text>
                {c.address && <Text size="xs" c="dimmed" lineClamp={1}>{c.address}</Text>}
              </Combobox.Option>
            ))}
            {candidates.length === 0 && !loading && query.trim().length > 0 && (
              <Combobox.Empty>无结果</Combobox.Empty>
            )}
          </Combobox.Options>
        </Combobox.Dropdown>
      </Combobox>
    </Stack>
  )
}
