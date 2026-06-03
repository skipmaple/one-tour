import { formatDuration, formatLocator, pickMeta } from '../activityCardMeta'

describe('formatDuration', () => {
  it('returns empty string for falsy / zero', () => {
    expect(formatDuration(0)).toBe('')
    expect(formatDuration(null)).toBe('')
    expect(formatDuration(undefined)).toBe('')
  })

  it('shows raw minutes under an hour', () => {
    expect(formatDuration(45)).toBe('45分')
    expect(formatDuration(30)).toBe('30分')
  })

  it('shows whole hours without decimals', () => {
    expect(formatDuration(60)).toBe('1h')
    expect(formatDuration(120)).toBe('2h')
  })

  it('shows clean half hours', () => {
    expect(formatDuration(90)).toBe('1.5h')
    expect(formatDuration(150)).toBe('2.5h')
  })

  it('humanizes awkward values to one-decimal hours', () => {
    expect(formatDuration(265)).toBe('4.4h')
    expect(formatDuration(100)).toBe('1.7h')
  })
})

describe('formatLocator', () => {
  it('returns empty for blank input', () => {
    expect(formatLocator('')).toBe('')
    expect(formatLocator(null)).toBe('')
    expect(formatLocator(undefined)).toBe('')
  })

  it('extracts an administrative-division token', () => {
    expect(formatLocator('玛纳斯县')).toBe('玛纳斯县')
    expect(formatLocator('窝堡乡交界处')).toBe('窝堡乡')
  })

  it('prefers the most specific (last) division token', () => {
    expect(formatLocator('城地区沙湾市')).toBe('沙湾市')
    expect(formatLocator('新疆维吾尔自治区玛纳斯县')).toBe('玛纳斯县')
  })

  it('falls back to the last segment when there is no division token', () => {
    expect(formatLocator('环路156号')).toBe('环路156号')
    expect(formatLocator('新疆阿勒泰 布尔津')).toBe('布尔津')
  })
})

describe('pickMeta', () => {
  const base = { kind: 'scenic', status: 'confirmed', details: {} }

  it('returns empty alerts + notes for a bare confirmed activity', () => {
    expect(pickMeta({ ...base })).toEqual({ alerts: [], notes: [] })
  })

  // ---- alerts: the ONLY colored chips (status / warning idiom) ----

  it('puts closed / pending / 需预约 into alerts', () => {
    expect(pickMeta({ ...base, status: 'closed' }).alerts[0]).toMatchObject({ tone: 'danger', text: '暂停开放' })
    expect(pickMeta({ ...base, status: 'pending' }).alerts[0]).toMatchObject({ tone: 'muted', text: '待定' })
    expect(pickMeta({ ...base, details: { need_reservation: true } }).alerts.some((a) => a.text === '需预约')).toBe(true)
  })

  // ---- notes: quiet gray inline data, never colored pills ----

  it('puts rating + quality keytag into notes, not alerts', () => {
    const meta = pickMeta({ ...base, details: { place: { rating: '4.9', keytag: '5A景区' } } })
    expect(meta.notes.some((n) => n.icon === 'star' && n.text === '4.9')).toBe(true)
    expect(meta.notes.some((n) => n.text === '5A景区')).toBe(true)
    expect(meta.alerts).toEqual([]) // data never becomes a colored badge
  })

  it('drops non-quality keytags, keeps 景区 / 型 / 特色住宿', () => {
    expect(pickMeta({ ...base, details: { place: { keytag: '停车场' } } }).notes).toEqual([])
    expect(pickMeta({ ...base, details: { place: { keytag: '住宿服务,住宿服务相关' } } }).notes).toEqual([])
    expect(pickMeta({ ...base, details: { place: { keytag: '高档型' } } }).notes.some((n) => n.text === '高档型')).toBe(true)
    expect(pickMeta({ ...base, details: { place: { keytag: '4A景区' } } }).notes.some((n) => n.text === '4A景区')).toBe(true)
  })

  it('surfaces one kind-specific context note (best_light / altitude / price)', () => {
    expect(pickMeta({ ...base, details: { best_light: '黄昏' } }).notes.some((n) => n.text === '光线·黄昏')).toBe(true)
    expect(pickMeta({ ...base, details: { altitude: 3200 } }).notes.some((n) => n.text === '海拔3200m')).toBe(true)
    expect(pickMeta({ ...base, kind: 'food', details: { price_pp: 120 } }).notes.some((n) => n.text === '人均¥120')).toBe(true)
  })

  it('adds a locator note (pin) from address, then place city', () => {
    expect(pickMeta({ ...base, address: '新疆阿勒泰 布尔津县' }).notes.some((n) => n.icon === 'pin' && n.text === '布尔津县')).toBe(true)
    expect(pickMeta({ ...base, details: { cityname: '伊宁市' } }).notes.some((n) => n.icon === 'pin' && n.text === '伊宁市')).toBe(true)
  })

  it('adds a 可选 note for tier_three only', () => {
    expect(pickMeta({ ...base, citizen_level: 'tier_three' }).notes.some((n) => n.text === '可选')).toBe(true)
    expect(pickMeta({ ...base, citizen_level: 'tier_one' }).notes).toEqual([])
    expect(pickMeta({ ...base, citizen_level: 'tier_two' }).notes).toEqual([])
  })

  it('caps notes at three (rating > keytag > context > locator > 可选)', () => {
    const { notes } = pickMeta({
      ...base,
      citizen_level: 'tier_three',
      address: '玛纳斯县',
      details: { place: { rating: '4.9', keytag: '5A景区' }, altitude: 3200 },
    })
    expect(notes.map((n) => n.text)).toEqual([ '4.9', '5A景区', '海拔3200m' ])
  })
})
