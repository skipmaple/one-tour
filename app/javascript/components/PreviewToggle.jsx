import { SegmentedControl } from '@mantine/core'

export default function PreviewToggle({ value, onChange }) {
  return (
    <SegmentedControl
      value={value}
      onChange={onChange}
      data={[
        { label: 'Markdown', value: 'markdown' },
        { label: '地图', value: 'map' },
      ]}
      size="xs"
    />
  )
}
