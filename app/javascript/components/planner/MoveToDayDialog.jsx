import { Modal, Stack, Button, Text } from '@mantine/core'
import { useIsMobile } from '../../hooks/useIsMobile'

// 底部 Tab 规划器里候选与日程在不同 Tab，无法拖拽过去；长按菜单经此弹窗选目标天。
export default function MoveToDayDialog({ opened, onClose, days, byDay, onPick }) {
  const isMobile = useIsMobile()
  return (
    <Modal opened={opened} onClose={onClose} title="加入哪一天？" size="sm" centered fullScreen={isMobile}>
      <Stack gap="xs">
        {(!days || days.length === 0) && <Text c="dimmed" size="sm">还没有日程，先在「日程」里新建一天。</Text>}
        {(days || []).map((d) => {
          const count = (byDay?.[d.id] || []).length
          return (
            <Button key={d.id} variant="light" fullWidth justify="space-between"
              rightSection={<Text size="xs" c="dimmed">{count} 行</Text>}
              onClick={() => { onPick(d.id, count + 1); onClose() }}>
              D{d.day_index}{d.title ? ` · ${d.title}` : ''}
            </Button>
          )
        })}
      </Stack>
    </Modal>
  )
}
