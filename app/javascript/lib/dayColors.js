// 10-color palette using Mantine theme color names. Cycles when day_index > 10.
// Consumed by PlannerMap (marker fill color), DayColumn (dayColorName prop
// that feeds data-day-color attr on cards/connectors → CSS --day-accent var),
// and activity-card.css (selectors that define --day-accent per color).
export const DAY_PALETTE = [
  'red', 'pink', 'grape', 'violet', 'indigo',
  'blue', 'cyan', 'teal', 'green', 'yellow'
]

export function DAY_COLOR(day_index) {
  // Handle negative / zero gracefully via positive modulo
  const idx = ((day_index - 1) % DAY_PALETTE.length + DAY_PALETTE.length) % DAY_PALETTE.length
  return DAY_PALETTE[idx]
}
