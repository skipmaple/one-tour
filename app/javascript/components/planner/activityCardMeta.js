// Pure presentation helpers for ActivityCard. Kept framework-free (no JSX, no
// icon components) so they unit-test in isolation; the card maps the returned
// descriptors to Tabler icons + CSS tone classes.

// planned_duration_min → human string.
//   0 / null / undefined → ''
//   <60                  → '45分'
//   whole hours          → '2h'
//   clean half hours     → '1.5h'
//   anything else        → one-decimal hours, '265 → 4.4h' (no more raw "265分")
export function formatDuration(min) {
  if (!min) return ''
  if (min < 60) return `${min}分`
  if (min % 30 === 0) return `${min / 60}h` // whole + clean half hours: '1h', '1.5h'
  return `${(min / 60).toFixed(1)}h`
}

// Pull a locating token out of a free-form address. Chinese addresses run
// big→small, so the LAST administrative-division token is the most specific
// (县/区/市 over 省/自治区). Falls back to the trailing segment when the address
// is descriptive ("环路156号") rather than administrative.
const ADMIN_DIVISION = /[一-龥]{1,7}?(?:市|县|区|州|盟|镇|乡)/g

export function formatLocator(address) {
  if (!address) return ''
  const s = String(address)
  const matches = s.match(ADMIN_DIVISION)
  if (matches && matches.length) {
    const last = matches[matches.length - 1]
    return last.length > 8 ? last.slice(-8) : last
  }
  const segments = s.split(/[\s、，,]+/).filter(Boolean)
  const last = segments[segments.length - 1] || ''
  return last.length > 8 ? last.slice(-8) : last
}

// AMAP keytag is inconsistent — sometimes a quality grade (5A景区 / 高档型 /
// 经济型), but often just a category label (停车场 / 拉面 / 桥) or a comma-joined
// type path. Keep only the quality-meaningful ones for the card; drop the rest.
function qualityKeytag(kt) {
  if (!kt || kt.includes(',') || kt.includes('，') || kt.length > 8) return null
  return (/景区$/.test(kt) || /型$/.test(kt) || kt === '特色住宿') ? kt : null
}

// One context chip per kind, drawn from `details`. Returns a chip descriptor or
// null. Context chips are always neutral ('muted') — saturated tones are
// reserved for status/reservation so warnings stay loud.
function contextChip(kind, details) {
  const d = details || {}
  switch (kind) {
    case 'scenic':
      if (d.best_light) return { tone: 'muted', text: `光线·${d.best_light}` }
      if (d.altitude > 0) return { tone: 'muted', text: `海拔${d.altitude}m` }
      return null
    case 'food':
      if (d.price_pp > 0) return { tone: 'muted', text: `人均¥${d.price_pp}` }
      if (d.open_hours) return { tone: 'muted', text: `营业 ${d.open_hours}` }
      return null
    case 'stay':
      if (d.price_pp > 0) return { tone: 'muted', text: `¥${d.price_pp}/人` }
      return null
    case 'fuel':
      if (d.h24) return { tone: 'muted', text: '24h' }
      if (d.next_station_km > 0) return { tone: 'muted', text: `下站${d.next_station_km}km` }
      return null
    default:
      return null
  }
}

// Card meta in two tiers, matching OneTour's idiom (color is reserved for
// status/warnings; all other data is quiet gray inline text — see the
// ExpenseDrawer "付款人·分类·分摊" pattern and the hard/soft-violation badges):
//   alerts — status / warning, rendered as light-colored badges
//            (暂停开放=danger, 待定=muted, 需预约=warn). The only colored chips.
//   notes  — gray "·"-joined data: rating, quality tag, kind detail, locator,
//            可选. Ranked; capped at 3.
export function pickMeta(activity) {
  const { kind, status, details, address, citizen_level } = activity || {}

  const alerts = []
  if (status === 'closed') alerts.push({ tone: 'danger', text: '暂停开放' })
  else if (status === 'pending') alerts.push({ tone: 'muted', text: '待定' })
  if (details && details.need_reservation) alerts.push({ tone: 'warn', text: '需预约' })

  const notes = []
  const place = (details && details.place) || {}
  if (place.rating) notes.push({ icon: 'star', text: String(place.rating) })
  const keytag = qualityKeytag(place.keytag)
  if (keytag) notes.push({ text: keytag })
  const ctx = contextChip(kind, details)
  if (ctx) notes.push({ text: ctx.text })
  // Locator: free-text address first, then the structured POI fields
  // LocationPicker persists (cityname/adname/pname).
  const locator = formatLocator(address) || details?.cityname || details?.adname || details?.pname || ''
  if (locator) notes.push({ icon: 'pin', text: locator })
  // tier_three is the explicitly cuttable tier; tier_one carries the star,
  // tier_two / infrastructure stay unmarked to avoid noise.
  if (citizen_level === 'tier_three') notes.push({ text: '可选' })

  return { alerts, notes: notes.slice(0, 3) }
}
