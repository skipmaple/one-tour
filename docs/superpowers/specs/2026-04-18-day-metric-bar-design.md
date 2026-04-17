# DayMetricBar: replace Unicode tofu progress bars

## Problem

`DayColumn.jsx` and `TimelineDayColumn.jsx` render per-day metric progress bars by string-concatenating `█` (U+2588) and `░` (U+2591). At `fontSize: 10` with `color: '#666'` this produces three problems:

1. **Rendering risk** — On fonts without these box-drawing glyphs (some Windows fallbacks, older Android system fonts) the characters render as tofu boxes or blanks.
2. **Accessibility** — 10px exceeds readable minimums; `#666` on white is borderline contrast.
3. **No warning signal in `DayColumn`** — `DayColumn` shows the same flat `#666` whether you are at 10% or 200% of the cap. `TimelineDayColumn` adds a `⛔` on overflow but color does not change either.

The "terminal aesthetic" per-se is not a brand concern here (the calligraphy feel is scoped to the Constitution page only).

## Scope

- Replace both call sites with a shared `<DayMetricBar>` component.
- Three-tier color signal (normal / near / over) on the bar itself.
- Remove the `⛔` emoji from `TimelineDayColumn` (color now carries the signal).
- Delete the duplicated `progressBar()` helper from both files.

Out of scope: redesigning the day card footer layout, exposing thresholds as per-tour configuration, custom ARIA annotations beyond whatever Mantine `<Progress>` renders by default.

## Component: `DayMetricBar`

**Path**: `app/javascript/components/DayMetricBar.jsx` (cross-cutting; lives at `components/` root alongside `Toast.jsx` / `ErrorFallback.jsx`).

**Props**:

| Prop    | Type   | Purpose                                   |
|---------|--------|-------------------------------------------|
| `label` | string | Left label, e.g. `驾驶` / `核心`           |
| `value` | number | Current usage                             |
| `max`   | number | Cap. If `0` or falsy, bar renders neutral with `value/0` text unchanged |
| `unit`  | string | Optional, appended to the ratio: `0/7h`   |

**Tier logic** (computed from `pct = value / max`):

| Condition              | Mantine color | Intent                 |
|------------------------|---------------|------------------------|
| `max <= 0`             | `gray.4`      | No cap / disabled      |
| `pct > 1.0`            | `red.6`       | Over cap — must fix    |
| `pct >= 0.9`           | `yellow.6`    | Near cap — plan ahead  |
| otherwise              | `gray.5`      | Normal                 |

Bar fill is `Math.min(pct * 100, 100)` so overflow does not visually extend past the track — the color tells the user it is over.

**Layout** (single line, `wrap="nowrap"`):

```
[驾驶]  [━━━━━━━━━━]  [0/7h]
 24px   flex:1 min=40  right-aligned
```

- Container: `<Group gap={6} wrap="nowrap">`
- Label: `<Text size="xs" c="dimmed" w={28}>` — fixed 28px so bars align between `驾驶` / `核心` rows
- Bar: `<Progress size="sm" value={fillPct} color={tierColor} style={{ flex: 1, minWidth: 40 }} />`
- Ratio: `<Text size="xs" c="dimmed">{value}/{max}{unit}</Text>` — no fixed width, shrinks to content

Font size: Mantine `size="xs"` = 12px, replacing the current hardcoded `fontSize: 10`.

## Call-site changes

### `app/javascript/components/planner/DayColumn.jsx`

Replace lines 98–102:

```jsx
<div style={{ borderTop: '1px dashed #ccc', padding: '4px 8px' }}>
  <DayMetricBar label="驾驶" value={driveH} max={maxH} unit="h" />
  <DayMetricBar label="核心" value={tierOneCount} max={maxTier1} />
  {day.buffer_day && <Text size="xs" c="dimmed" mt={2}>机动</Text>}
</div>
```

Delete the `progressBar()` function (lines 107–110).

### `app/javascript/components/timeline/TimelineDayColumn.jsx`

Replace lines 70–73:

```jsx
<div style={{ borderTop: '1px dashed #ccc', padding: '4px 8px' }}>
  <DayMetricBar label="驾驶" value={driveH} max={maxH} unit="h" />
  <DayMetricBar label="核心" value={tierOneCount} max={maxTier1} />
</div>
```

Delete the `progressBar()` function (lines 107–110). Also delete the `driveOk` / `tierOneOk` computations that are now dead (they only fed the `⛔` emoji).

## Tests

### New: `app/javascript/components/__tests__/DayMetricBar.test.jsx`

- Renders label, value, max, and optional unit in the expected order.
- Color is `gray.5` when `pct < 0.9`. Assert by querying the Progress element and checking the computed `background-color` (or the Mantine CSS variable on the fill), not the `color` prop directly — we care about what rendered.
- Color is `yellow.6` when `0.9 <= pct <= 1.0`.
- Color is `red.6` when `pct > 1.0`.
- Color is `gray.4` when `max == 0`; does not throw on `value/0`.
- Bar fill never exceeds 100% even when `value > max`.

### Existing

- `app/javascript/components/planner/__tests__/DayColumn.test.jsx` — current assertions are on text (e.g. `0/4h`); those still render from the new component. Verify all 8 cases still pass without edits.
- `TimelineDayColumn` has no test file today; not adding one as part of this change.

## Non-goals / explicitly rejected alternatives

- **Native `<progress>` element** — `<Progress>` from Mantine is already used elsewhere in this app and matches the design system. Using the native element would diverge styling.
- **Stacked layout (label+ratio row, then bar row)** — doubles footer height; rejected because day columns are laid out side-by-side and uneven footer heights break the grid.
- **Reusing `INTENSITY_COLORS` from `DayColumn.jsx`** — those are day-level intensity semantics (light/medium/heavy workload), not per-metric cap utilization. Mixing the two color systems would confuse the signal.
- **Keeping the `⛔` icon** — redundant with the red bar color. Color alone is acceptable here because `TimelineDayColumn` (total overview) also surfaces the overflow through other signals (day-level intensity dot, aggregate health score); for the `DayColumn` in the planner, being one of many cues alongside drag warnings is enough.

## Edge cases

- `max == 0` — treat as "no cap configured". Bar renders neutral gray.4 at 0% fill; ratio text still renders as `value/0{unit}`. Division-by-zero guarded in the tier computation (`if (max <= 0) return 'gray.4'`).
- `value` is a float (e.g. `driveH = 0.3`) — rendered as-is; no rounding added beyond what callers already do.
- Very small day columns (<150px) — `minWidth: 40` on the bar ensures it does not collapse; label and ratio retain minimum space. If the parent clips, text is not truncated (acceptable; nothing today accounts for this).
