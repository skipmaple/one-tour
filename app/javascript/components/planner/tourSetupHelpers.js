// Helpers for the onboarding flow inside ConstitutionDrawer.
// Previously inlined in pages/Tour/Constitution.jsx (deleted 2026-04-21).

export async function postJson(url, method, body) {
  const token = document.querySelector('meta[name=csrf-token]')?.getAttribute('content') || ''
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-CSRF-Token': token,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`${method} ${url} 失败 (${res.status})`)
  return res
}

export function formatDateISO(d) {
  if (!d) return null
  if (typeof d === 'string') {
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : formatDateISO(new Date(d))
  }
  if (!(d instanceof Date) || isNaN(d)) return null
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Returns today's LOCAL calendar date as "YYYY-MM-DD". Do not use
// `new Date().toISOString().slice(0,10)` — in Asia/Shanghai (UTC+8) that
// returns the previous calendar date for the first 8 hours of each day.
export function todayLocal() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Returns null when the date range and days count are consistent or either
// side is not fully specified; otherwise { implied, current }.
export function detectDateDaysConflict(range, days) {
  if (!range) return null
  const [start, end] = range
  if (!start || !end) return null
  if (!days || days <= 0) return null
  const s = new Date(start).getTime()
  const e = new Date(end).getTime()
  if (isNaN(s) || isNaN(e)) return null
  const implied = Math.round((e - s) / 86400000) + 1
  if (implied === days) return null
  return { implied, current: days }
}

// Parse a stored tour.date_range string like "2025-05-01 ~ 2025-05-07"
// into [startDate, endDate] (Date objects or [null, null] if unparseable).
export function parseTourDateRange(dateRangeStr) {
  if (!dateRangeStr) return [null, null]
  const parts = dateRangeStr.split(/[~\-–—]/).map(s => s.trim()).filter(Boolean)
  if (parts.length === 2) {
    const d1 = new Date(parts[0])
    const d2 = new Date(parts[1])
    if (!isNaN(d1) && !isNaN(d2)) return [d1, d2]
  }
  return [null, null]
}
