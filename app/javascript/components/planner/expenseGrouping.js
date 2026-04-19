// Groups expenses for ExpenseDrawer's overview tab. Returns null for "flat"
// so the caller keeps using its existing chronological rendering.
//
// by_day: activity-scope expenses roll up to their activity's day; tour-scope
// ones land in a "整程" bucket at the end.
//
// by_activity: activity-scope expenses grouped by activity (ordered by
// day_index, position within day); day-scope expenses go to per-day "全天"
// buckets sorted after the day's activities; tour-scope to a single "整程".
export function groupExpenses(expenses, mode, activityById, dayById) {
  if (mode === 'flat') return null

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
    }
  }

  return Array.from(groups.values()).sort((a, b) => a.sortKey - b.sortKey)
}

export function sumAmountCents(expenses) {
  return expenses.reduce((s, e) => s + (e.amount_cents || 0), 0)
}
