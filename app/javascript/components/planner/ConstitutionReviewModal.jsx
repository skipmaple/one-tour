import { Modal, Button, Text, Stack, Group, Divider } from '@mantine/core'
import ConstitutionFullText from './ConstitutionFullText'

export default function ConstitutionReviewModal({ opened, onClose, constitution }) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="《本程宪法》"
      size="lg"
      centered
      overlayProps={{ opacity: 0.55, blur: 3 }}
      styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          以下是本程的完整规则。参数值已按你的设置填入。请通读后点击底部"已阅知"按钮。
        </Text>
        <Divider />
        <ConstitutionFullText constitution={constitution} />
        <Divider />
        <Group justify="center" pt="md" pb="sm">
          <Button size="md" onClick={onClose}>
            已阅知，开始规划 →
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
