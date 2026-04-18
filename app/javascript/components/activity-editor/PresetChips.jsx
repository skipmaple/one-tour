import { Group, UnstyledButton } from '@mantine/core'

// 在 NumberInput 下方渲染一排快捷芯片，点击写入目标值。
// ariaLabelPrefix: 字段名，用于拼出每个 chip 的无障碍标签，如"设置 建议停留 为 60"。
export default function PresetChips({ values, onPick, ariaLabelPrefix }) {
  if (!values || values.length === 0) return null
  return (
    <Group gap={4} mt={4}>
      {values.map(v => (
        <UnstyledButton
          key={v}
          type="button"
          onClick={() => onPick(v)}
          aria-label={ariaLabelPrefix ? `设置 ${ariaLabelPrefix} 为 ${v}` : undefined}
          style={{
            fontSize: 11,
            padding: '2px 8px',
            border: '1px solid var(--mantine-color-gray-3)',
            borderRadius: 12,
            background: 'var(--mantine-color-gray-0)',
            color: 'var(--mantine-color-gray-7)',
            cursor: 'pointer',
          }}
        >
          {v}
        </UnstyledButton>
      ))}
    </Group>
  )
}
