import { useRef } from 'react'
import { ActionIcon, Group, Stack, Textarea, Text } from '@mantine/core'
import {
  IconBold, IconItalic, IconList, IconLink, IconHeading,
} from '@tabler/icons-react'

const MAX_LENGTH = 50_000

// Light-weight markdown editor: 5-button toolbar over a Mantine Textarea.
// Operations use the native `setRangeText` so the browser's built-in undo
// stack keeps working. Never introduces an editor framework.
//
// Toolbar actions:
//   Bold      — wraps selection with **; no selection → inserts **粗体** (selected)
//   Italic    — wraps selection with *;  no selection → inserts *斜体*   (selected)
//   List      — prefixes each line touched by selection with "- "
//   Link      — [selection](url); no selection → [](url) and caret between []
//   Heading   — prefixes current line with "### " (H3)
export default function MarkdownEditor({ value, onChange, maxLength = MAX_LENGTH }) {
  const ref = useRef(null)

  const apply = (fn) => {
    const ta = ref.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const { next, selStart, selEnd } = fn({ value: value || '', start, end })
    onChange(next)
    // Restore selection after React applies the new value in the next tick.
    requestAnimationFrame(() => {
      if (!ref.current) return
      ref.current.focus()
      ref.current.setSelectionRange(selStart, selEnd)
    })
  }

  const wrap = (marker, placeholder) => ({ value, start, end }) => {
    if (start === end) {
      const insert = `${marker}${placeholder}${marker}`
      const next = value.slice(0, start) + insert + value.slice(end)
      return { next, selStart: start + marker.length, selEnd: start + marker.length + placeholder.length }
    }
    const selected = value.slice(start, end)
    const next = value.slice(0, start) + marker + selected + marker + value.slice(end)
    return { next, selStart: start, selEnd: end + marker.length * 2 }
  }

  const prefixLines = (prefix) => ({ value, start, end }) => {
    // Expand to line boundaries.
    const lineStart = value.lastIndexOf('\n', start - 1) + 1
    const lineEnd = (() => {
      const nl = value.indexOf('\n', end)
      return nl === -1 ? value.length : nl
    })()
    const block = value.slice(lineStart, lineEnd)
    const prefixed = block.split('\n').map((ln) => prefix + ln).join('\n')
    const next = value.slice(0, lineStart) + prefixed + value.slice(lineEnd)
    const delta = prefixed.length - block.length
    return { next, selStart: start + prefix.length, selEnd: end + delta }
  }

  // Heading (H3) acts as a toggle: adds "### " when absent, strips it when
  // present. Keeps caret at its same visual position on the line.
  const toggleHeading = () => ({ value, start, end }) => {
    const lineStart = value.lastIndexOf('\n', start - 1) + 1
    const lineEnd = (() => {
      const nl = value.indexOf('\n', end)
      return nl === -1 ? value.length : nl
    })()
    const line = value.slice(lineStart, lineEnd)
    if (line.startsWith('### ')) {
      const next = value.slice(0, lineStart) + line.slice(4) + value.slice(lineEnd)
      return { next, selStart: Math.max(lineStart, start - 4), selEnd: Math.max(lineStart, end - 4) }
    }
    const next = value.slice(0, lineStart) + '### ' + line + value.slice(lineEnd)
    return { next, selStart: start + 4, selEnd: end + 4 }
  }

  const insertLink = () => ({ value, start, end }) => {
    if (start === end) {
      const insert = '[](url)'
      const next = value.slice(0, start) + insert + value.slice(end)
      return { next, selStart: start + 1, selEnd: start + 1 }
    }
    const selected = value.slice(start, end)
    const insert = `[${selected}](url)`
    const next = value.slice(0, start) + insert + value.slice(end)
    const urlStart = start + selected.length + 3 // "[selected]("
    return { next, selStart: urlStart, selEnd: urlStart + 3 } // select "url"
  }

  // Byte count (UTF-8), not JS string length — the backend limit is expressed
  // in bytes (Activity::DESC_MAX_BYTES). Counting code units would let CJK
  // users see "16666 / 50000" then hit 422 at ~16,667 chars (3 bytes each).
  const bytes = new TextEncoder().encode(value || '').length
  const counterColor = bytes > maxLength ? 'red' : bytes > maxLength * 0.9 ? 'orange' : 'dimmed'

  return (
    <Stack gap={4}>
      <Group gap={4} wrap="nowrap">
        <ActionIcon variant="subtle" size="sm" aria-label="粗体" onClick={() => apply(wrap('**', '粗体'))}>
          <IconBold size={16} />
        </ActionIcon>
        <ActionIcon variant="subtle" size="sm" aria-label="斜体" onClick={() => apply(wrap('*', '斜体'))}>
          <IconItalic size={16} />
        </ActionIcon>
        <ActionIcon variant="subtle" size="sm" aria-label="无序列表" onClick={() => apply(prefixLines('- '))}>
          <IconList size={16} />
        </ActionIcon>
        <ActionIcon variant="subtle" size="sm" aria-label="链接" onClick={() => apply(insertLink())}>
          <IconLink size={16} />
        </ActionIcon>
        <ActionIcon variant="subtle" size="sm" aria-label="标题" onClick={() => apply(toggleHeading())}>
          <IconHeading size={16} />
        </ActionIcon>
      </Group>
      <Textarea
        ref={ref}
        value={value || ''}
        onChange={(e) => onChange(e.currentTarget.value)}
        autosize
        minRows={3}
        maxRows={30}
      />
      <Text size="xs" c={counterColor} ta="right">{bytes} / {maxLength} 字节</Text>
    </Stack>
  )
}
