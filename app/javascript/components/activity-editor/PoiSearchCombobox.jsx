import { useState, useRef, useCallback } from 'react'
import { Combobox, TextInput, Loader, Text, useCombobox } from '@mantine/core'

export default function PoiSearchCombobox({ onPick }) {
  const [query, setQuery] = useState('')
  const [candidates, setCandidates] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const timerRef = useRef(null)
  const combobox = useCombobox()

  const search = useCallback((q) => {
    if (q.trim().length === 0) {
      setCandidates([])
      return
    }
    setLoading(true)
    setError(null)
    fetch(`/poi_search?q=${encodeURIComponent(q)}`)
      .then(res => {
        if (res.status === 429) {
          setError('搜索太频繁，请稍后重试')
          setCandidates([])
          return null
        }
        return res.json()
      })
      .then(data => {
        if (data && data.candidates) {
          setCandidates(data.candidates)
          combobox.openDropdown()
        }
      })
      .catch(() => setError('搜索失败'))
      .finally(() => setLoading(false))
  }, [combobox])

  const handleChange = (val) => {
    setQuery(val)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => search(val), 300)
  }

  const handleSelect = (idx) => {
    const c = candidates[Number(idx)]
    if (c && onPick) {
      onPick({ name: c.name, lat: c.lat, lng: c.lng, address: c.address })
    }
    combobox.closeDropdown()
  }

  return (
    <Combobox store={combobox} onOptionSubmit={handleSelect}>
      <Combobox.Target>
        <TextInput
          label="搜索地点"
          placeholder="输入地名搜索..."
          value={query}
          onChange={e => handleChange(e.currentTarget.value)}
          rightSection={loading ? <Loader size={14} /> : null}
          error={error}
          onFocus={() => { if (candidates.length > 0) combobox.openDropdown() }}
        />
      </Combobox.Target>
      <Combobox.Dropdown>
        <Combobox.Options>
          {candidates.map((c, i) => (
            <Combobox.Option key={i} value={String(i)}>
              <Text size="sm">{c.name}</Text>
              <Text size="xs" c="dimmed">
                {[c.address, c.type].filter(Boolean).join(' · ')}
              </Text>
            </Combobox.Option>
          ))}
          {candidates.length === 0 && !loading && query.trim().length > 0 && (
            <Combobox.Empty>无结果</Combobox.Empty>
          )}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  )
}
