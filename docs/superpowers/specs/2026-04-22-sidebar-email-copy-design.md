# Sidebar Email Click-to-Copy — Design

**Date:** 2026-04-22
**Status:** Spec, ready for review

## Goal

In the sidebar user dropdown, clicking the email address copies it to the clipboard with inline "已复制" feedback. Addresses the friction of selecting long, opaque IDs (e.g. Feishu `ou_…@feishu.noreply.lark.com`) by hand.

## Non-Goals

- Global toast / notification system (project has none; not adding one for this).
- Making other text in the menu (name, nav items) copyable.
- Right-click / context-menu customization.
- Keyboard shortcut beyond native `Enter` / `Space` on the button.

## Current State

- [`app/javascript/layouts/sidebar/UserSection.jsx`](../../../app/javascript/layouts/sidebar/UserSection.jsx) renders the email as a non-interactive `<Menu.Label>`.
- Overflow fix just landed in this branch — email wraps within the 220px dropdown via `wordBreak: break-all`.
- Deps already present: `@mantine/hooks` (used for `useDisclosure`), `@tabler/icons-react` (sidebar icons).

## Design

### File structure

**Modified**
- [`app/javascript/layouts/sidebar/UserSection.jsx`](../../../app/javascript/layouts/sidebar/UserSection.jsx) — swap the passive `Menu.Label` holding the email for an interactive `UnstyledButton` with clipboard + hover logic.
- [`app/javascript/layouts/sidebar/__tests__/UserSection.test.jsx`](../../../app/javascript/layouts/sidebar/__tests__/UserSection.test.jsx) — add click-to-copy test case.

**New** — none.

### Component shape

Replace this:

```jsx
<Menu.Label c="dimmed" fz="xs" style={{ fontWeight: 'normal', wordBreak: 'break-all', whiteSpace: 'normal' }}>
  {current_user.email}
</Menu.Label>
```

with an `UnstyledButton` containing a `Group` of `Text` + trailing icon. Keep styling visually aligned with `Menu.Label` (padding, dimmed color, `fz="xs"`, normal weight).

### State machine

Two Mantine hooks:
- `useClipboard({ timeout: 1500 })` → `{ copy, copied }`
- `useHover()` → `{ hovered, ref }`

Rendering:

| State | Text | Trailing icon |
|---|---|---|
| Idle | email | none |
| Hover (not copied) | email | `IconCopy` 14px, `var(--mantine-color-dimmed)`, `opacity: 0 → 1` via 120ms transition |
| Copied (1.5s) | `已复制` | `IconCheck` 14px, `var(--mantine-color-teal-6)` |

`copied` overrides `hovered` in the rendering decision.

### Interaction

- Click fires `clipboard.copy(current_user.email)`. Mantine's `useClipboard` internally calls `navigator.clipboard.writeText` and flips `copied` true, resetting after 1500ms.
- Clicking a `Menu.Label`/button inside a Mantine `Menu.Dropdown` does not close the menu (only `Menu.Item` has auto-close). Confirmed behavior — user sees the "已复制" swap.
- `aria-label={`复制邮箱 ${current_user.email}`}` for screen readers, since the visible text is the email itself and "已复制" is a transient state.
- `cursor: pointer` on hover.

### Styling details

- Hover transition (opacity) via inline `style` on the icon element. Idle `opacity: 0`, `hovered || copied` → `opacity: 1`. Both states keep the icon mounted so the transition runs smoothly — no unmount pop-in.
- Text uses the same `wordBreak: break-all; whiteSpace: normal` kept from the overflow fix.
- Padding matches Mantine's `Menu.Label` approximate metrics (`px="sm" py={4}`) so the visual rhythm of the dropdown doesn't change.

## Testing

Add one test to `UserSection.test.jsx`:

```js
it('copies email to clipboard and flashes 已复制', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.assign(navigator, { clipboard: { writeText } })
  const user = userEvent.setup()
  renderWithProvider(<UserSection />)
  await user.click(screen.getByText('张三'))
  await user.click(screen.getByRole('button', { name: /复制邮箱/ }))
  expect(writeText).toHaveBeenCalledWith('zhang@example.com')
  expect(await screen.findByText('已复制')).toBeInTheDocument()
})
```

jsdom has no native `navigator.clipboard`; stubbing per test (as above) is sufficient — no global setup change.

Keep the prior two tests (render name, open menu shows 个人设置/退出) and the overflow style test unchanged.

## Risks / Notes

- `navigator.clipboard.writeText` requires a secure context (https or localhost). Dev (`http://127.0.0.1`) qualifies; prod is on https. No fallback path needed.
- If the user's email is ever empty/null, the button block is already gated on `current_user.email && …`, so no interactive button is rendered for email-less accounts.
- No Sentry implications — the action is client-only, no network call. If `clipboard.writeText` rejects (e.g. permissions blocked), Mantine's `useClipboard` catches and leaves `copied` false; the user sees no "已复制" and can try again. Acceptable.

## Rollout

Single PR. No migration, no feature flag. Merge after CI (`rubocop` / `brakeman` / `npm audit`) and local `npm test` green.
