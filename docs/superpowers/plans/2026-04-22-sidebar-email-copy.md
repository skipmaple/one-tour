# Sidebar Email Click-to-Copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the email shown in the sidebar user dropdown clickable to copy, with inline "已复制" feedback.

**Architecture:** Swap the passive `Menu.Label` that holds the email for an interactive `UnstyledButton` driven by Mantine's `useClipboard` and `useHover` hooks. No new dependencies. Single-file change to `UserSection.jsx` plus one added test case.

**Tech Stack:** React 18, Mantine 7 (`@mantine/core`, `@mantine/hooks`), `@tabler/icons-react`, Vitest + `@testing-library/react` for tests.

---

## File Structure

- **Modify** [`app/javascript/layouts/sidebar/UserSection.jsx`](../../../app/javascript/layouts/sidebar/UserSection.jsx) — replace the email's `Menu.Label` with a click-to-copy `UnstyledButton`.
- **Modify** [`app/javascript/layouts/sidebar/__tests__/UserSection.test.jsx`](../../../app/javascript/layouts/sidebar/__tests__/UserSection.test.jsx) — add one test case covering the copy flow.

No new files, no deleted files. The overflow-wrap fix already present on this branch stays untouched and is bundled into the same final commit per user preference.

---

## Task 1: Add failing click-to-copy test

**Files:**
- Modify: `app/javascript/layouts/sidebar/__tests__/UserSection.test.jsx`

- [ ] **Step 1: Add the failing test at the bottom of the `describe` block**

In `app/javascript/layouts/sidebar/__tests__/UserSection.test.jsx`, add this test immediately after the existing `allows long email addresses to wrap…` test, inside the same `describe('UserSection', …)` block:

```js
  it('copies email to clipboard and flashes 已复制 on click', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
    const user = userEvent.setup()
    renderWithProvider(<UserSection />)
    await user.click(screen.getByText('张三'))

    const copyButton = await screen.findByRole('button', { name: /复制邮箱 zhang@example.com/ })
    await user.click(copyButton)

    expect(writeText).toHaveBeenCalledWith('zhang@example.com')
    expect(await screen.findByText('已复制')).toBeInTheDocument()
  })
```

Why `Object.defineProperty` instead of `Object.assign`: `navigator.clipboard` in jsdom is a read-only getter, and `Object.assign` silently no-ops on it. `defineProperty` with `configurable: true` makes the stub reliably overwrite.

- [ ] **Step 2: Run the new test to verify it fails**

Run:
```sh
npm test -- app/javascript/layouts/sidebar/__tests__/UserSection.test.jsx --run
```

Expected: the new test fails. The precise failure will be one of:
- `TestingLibraryElementError: Unable to find an accessible element with role "button" and name /复制邮箱/` — because the email is currently a non-interactive `Menu.Label` with no `aria-label`.

The other 3 tests (render name, open menu, overflow wrap style) should still pass.

---

## Task 2: Implement click-to-copy in `UserSection.jsx`

**Files:**
- Modify: `app/javascript/layouts/sidebar/UserSection.jsx`

- [ ] **Step 1: Replace the entire file content**

Overwrite `app/javascript/layouts/sidebar/UserSection.jsx` with this:

```jsx
import { Group, Avatar, Text, Menu, UnstyledButton } from '@mantine/core'
import { useDisclosure, useClipboard, useHover } from '@mantine/hooks'
import { IconCopy, IconCheck } from '@tabler/icons-react'
import { Link, usePage } from '@inertiajs/react'
import ProfileSettingsModal from '../../components/ProfileSettingsModal'

function EmailCopyItem({ email }) {
  const clipboard = useClipboard({ timeout: 1500 })
  const { hovered, ref } = useHover()
  const showIcon = hovered || clipboard.copied

  return (
    <UnstyledButton
      ref={ref}
      onClick={() => clipboard.copy(email)}
      aria-label={`复制邮箱 ${email}`}
      px="sm"
      py={4}
      w="100%"
      style={{ cursor: 'pointer' }}
    >
      <Group gap={6} wrap="nowrap" align="center" justify="space-between">
        <Text
          c="dimmed"
          fz="xs"
          style={{ wordBreak: 'break-all', whiteSpace: 'normal', flex: 1, minWidth: 0 }}
        >
          {clipboard.copied ? '已复制' : email}
        </Text>
        {clipboard.copied ? (
          <IconCheck
            size={14}
            style={{ color: 'var(--mantine-color-teal-6)', flexShrink: 0, opacity: 1, transition: 'opacity 120ms' }}
          />
        ) : (
          <IconCopy
            size={14}
            style={{ color: 'var(--mantine-color-dimmed)', flexShrink: 0, opacity: showIcon ? 1 : 0, transition: 'opacity 120ms' }}
          />
        )}
      </Group>
    </UnstyledButton>
  )
}

export default function UserSection() {
  const { current_user } = usePage().props
  const [opened, { open, close }] = useDisclosure(false)

  if (!current_user) return null

  return (
    <>
      <Menu shadow="md" width={220} position="top-start">
        <Menu.Target>
          <UnstyledButton px="sm" py="xs" w="100%">
            <Group gap="sm" wrap="nowrap">
              <Avatar src={current_user.avatar_url} radius="xl" size="sm">
                {current_user.name?.[0]?.toUpperCase()}
              </Avatar>
              <Text size="sm" truncate>{current_user.name}</Text>
            </Group>
          </UnstyledButton>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>{current_user.name}</Menu.Label>
          {current_user.email && <EmailCopyItem email={current_user.email} />}
          <Menu.Divider />
          <Menu.Item onClick={open}>个人设置</Menu.Item>
          <Menu.Item component={Link} href="/logout" method="delete" as="button">
            退出
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      <ProfileSettingsModal opened={opened} onClose={close} />
    </>
  )
}
```

Key points in this implementation:
- `EmailCopyItem` is a local sub-component — keeps the hook calls clean and avoids conditional hooks in the parent.
- `showIcon` keeps the `IconCopy` mounted always, toggling `opacity` so the 120ms transition works both directions (no pop-in).
- When `copied`, we swap to `IconCheck` (green) and the text to "已复制".
- `flex: 1, minWidth: 0` on the text is needed so `wordBreak` actually wraps inside a flex child — without `minWidth: 0`, flex children default to `min-width: auto` and refuse to shrink below their content.
- `flexShrink: 0` on the icons so they don't get squeezed when the email wraps.
- The existing overflow-wrap styles are preserved; they now live on the inner `Text` rather than on `Menu.Label`.

- [ ] **Step 2: Run the test to verify it passes**

Run:
```sh
npm test -- app/javascript/layouts/sidebar/__tests__/UserSection.test.jsx --run
```

Expected: all 4 tests pass, including the new copy test and the overflow test (which now checks the styles on the inner `Text`, via the same `getByText('zhang@example.com')` lookup).

If the overflow test fails because `toHaveStyle` is checking for styles that moved off the element it originally matched, that's an expected fallout. Fix: update the selector in that test to target the `Text` — but the existing test uses `screen.getByText('zhang@example.com')` which still resolves to the same `<Text>` element after the change (since `EmailCopyItem` renders the email inside `<Text>`), so no change should be needed. Verify by reading the failure, not by guessing.

---

## Task 3: Browser verification

**Files:** none (manual browser check).

- [ ] **Step 1: Confirm the dev server is still up**

Run:
```sh
curl -sf -o /dev/null -w "%{http_code}\n" http://127.0.0.1:9104/up
```

Expected: `200`. If not, run `bin/worktree-dev up` (the port may differ — read the printed `→ http://127.0.0.1:XXXX` line).

- [ ] **Step 2: Open the app, log in, open the sidebar user menu**

Navigate to the dev URL, sign in (new isolated DB — fresh sign-up or OAuth), click the avatar at the bottom-left of the sidebar.

- [ ] **Step 3: Verify the three visual states**

1. **Idle** — email visible, no trailing icon.
2. **Hover** — mouse over the email row → cursor changes to pointer, `IconCopy` fades in on the right (120ms).
3. **Click** — text swaps to `已复制`, icon swaps to a green `IconCheck`. After ~1.5s, back to idle/hover.

Verify the email wraps (doesn't overflow) if it's long — the prior fix is still in effect.

- [ ] **Step 4: Verify clipboard actually received the email**

Paste (`⌘V`) into any text field. Should produce the full email string.

---

## Task 4: Run the full JS test suite + final commit

**Files:** all three changes on the branch (`UserSection.jsx`, the test file, and the spec) committed together per user's bundling preference.

- [ ] **Step 1: Run the full JS test suite**

Run:
```sh
npm test -- --run
```

Expected: all tests pass. This catches any unrelated regression caused by the component shape change.

- [ ] **Step 2: Confirm nothing else is staged**

Run:
```sh
git status --short
```

Expected output (exact order may vary):
```
 M app/javascript/layouts/sidebar/UserSection.jsx
 M app/javascript/layouts/sidebar/__tests__/UserSection.test.jsx
?? docs/superpowers/plans/2026-04-22-sidebar-email-copy.md
?? docs/superpowers/specs/2026-04-22-sidebar-email-copy-design.md
```

If any other files appear, stop and investigate before committing.

- [ ] **Step 3: Stage the three target files and commit**

Run:
```sh
git add app/javascript/layouts/sidebar/UserSection.jsx \
        app/javascript/layouts/sidebar/__tests__/UserSection.test.jsx \
        docs/superpowers/specs/2026-04-22-sidebar-email-copy-design.md \
        docs/superpowers/plans/2026-04-22-sidebar-email-copy.md
git commit -m "$(cat <<'EOF'
feat(sidebar): click-to-copy email + fix long-email overflow

Replace the passive Menu.Label rendering the user email with an
UnstyledButton driven by useClipboard + useHover. Hover reveals a
Tabler IconCopy; clicking copies the address and swaps text to
"已复制" (+ IconCheck) for 1.5s before reverting. Keeps menu open so
the feedback is visible.

Also carries the overflow fix from the same branch — long Feishu-style
addresses now wrap inside the 220px dropdown (wordBreak: break-all,
whiteSpace: normal) instead of spilling out.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Verify the commit**

Run:
```sh
git log -1 --stat
```

Expected: one commit touching exactly the four files listed above.

---

## Self-Review

- **Spec coverage:**
  - Goal (click email → copy + inline 已复制 feedback) — Task 2 implementation + Task 1 test ✓
  - Non-Goals (no toast, no other copyable items, no keyboard shortcut beyond native) — respected; no code added for them ✓
  - Component shape (UnstyledButton + Group + Text + trailing icon) — Task 2 step 1 ✓
  - State machine table (idle / hover / copied) — Task 2 implementation + Task 3 manual verification ✓
  - `aria-label` — Task 2 step 1 (`aria-label={`复制邮箱 ${email}`}`), asserted by Task 1 test ✓
  - `cursor: pointer`, 120ms opacity transition — Task 2 step 1 ✓
  - Icon colors (dimmed / teal-6), size 14 — Task 2 step 1 ✓
  - Test with `navigator.clipboard.writeText` stub — Task 1 ✓
  - Overflow fix preserved — Task 2 step 1 (styles moved to inner `Text`), explicitly called out in step 2

- **Placeholder scan:** No TBD/TODO. No "add appropriate…" language. All code is complete.

- **Type consistency:** The component name `EmailCopyItem` is used consistently. The hooks referenced (`useClipboard`, `useHover`) return the documented shapes — `{ copy, copied }` and `{ hovered, ref }` — and are used that way.

- **Scope:** Two code files + one spec + one plan, one commit. Appropriately sized for a single plan.

---

## Execution Handoff

Plan complete and saved to [docs/superpowers/plans/2026-04-22-sidebar-email-copy.md](docs/superpowers/plans/2026-04-22-sidebar-email-copy.md).
