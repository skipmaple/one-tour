// Groups expenses for ExpenseDrawer's overview tab. Returns null for "flat"
// so the caller keeps using its existing chronological rendering.
//
// Supported modes:
//   flat         — no grouping (null return)
//   by_day       — by day; activity-scope expenses roll up to their
//                  activity's day; tour-scope → "整程 / 出发前" bucket
//   by_activity  — by activity; day-scope → per-day "全天" buckets; tour →
//                  single "整程"
//   by_payer     — by paid_by_id; sorted by group subtotal DESC
//   by_category  — by category enum; sorted by group subtotal DESC
//
// `lookups` (object) — { activityById, dayById, usersById, categoryLabels }.
//   All four are optional; missing ones degrade to reasonable fallbacks
//   ("（已删除行）", "某天", user id as label, raw enum string).
export function groupExpenses(expenses, mode, lookups = {}) {
  if (mode === 'flat') return null
  const { activityById = {}, dayById = {}, usersById = {}, categoryLabels = {} } = lookups

  const groups = new Map()
  const pushTo = (key, label, sortKey, expense) => {
    if (!groups.has(key)) {
      groups.set(key, { key, label, sortKey, expenses: [] })
    }
    groups.get(key).expenses.push(expense)
  }

  for (const e of expenses) {
    if (mode === 'by_day') {
      const effectiveDayId = e.day_id ?? activityById[e.activity_id]?.day_id ?? null
      if (effectiveDayId) {
        const d = dayById[effectiveDayId]
        pushTo(
          `day-${effectiveDayId}`,
          d ? `D${d.day_index}${d.title ? ' · ' + d.title : ''}` : '某天',
          d?.day_index ?? 9999,
          e,
        )
      } else {
        pushTo('tour', '整程 / 出发前', 99999, e)
      }
    } else if (mode === 'by_activity') {
      if (e.activity_id) {
        const a = activityById[e.activity_id]
        const dayIdx = a?.day_id ? (dayById[a.day_id]?.day_index ?? 999) : 999
        pushTo(
          `act-${e.activity_id}`,
          a ? a.name : '（已删除行）',
          dayIdx * 10000 + (a?.position ?? 0),
          e,
        )
      } else if (e.day_id) {
        const d = dayById[e.day_id]
        pushTo(
          `day-${e.day_id}-all`,
          d ? `D${d.day_index} · 全天` : '某天 · 全天',
          (d?.day_index ?? 9999) * 10000 + 9999,
          e,
        )
      } else {
        pushTo('tour', '整程 / 出发前', 99999999, e)
      }
    } else if (mode === 'by_payer') {
      const uid = e.paid_by_id
      pushTo(
        `payer-${uid}`,
        usersById[uid] || `用户 ${uid}`,
        0, // Overridden by subtotal DESC below.
        e,
      )
    } else if (mode === 'by_category') {
      const cat = e.category
      pushTo(
        `cat-${cat}`,
        categoryLabels[cat] || cat,
        0, // Overridden by subtotal DESC below.
        e,
      )
    }
  }

  const result = Array.from(groups.values())

  // For by_payer / by_category we want biggest buckets first — the natural
  // "who spent most / what did we spend most on" question. Others stay in
  // trip-chronological order.
  if (mode === 'by_payer' || mode === 'by_category') {
    result.forEach((g) => {
      g.sortKey = -g.expenses.reduce((s, e) => s + (e.amount_cents || 0), 0)
    })
  }

  return result.sort((a, b) => a.sortKey - b.sortKey)
}

export function sumAmountCents(expenses) {
  return expenses.reduce((s, e) => s + (e.amount_cents || 0), 0)
}
