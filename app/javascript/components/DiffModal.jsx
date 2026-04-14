import { useMemo } from 'react'
import { Modal, Button, Group, Text, ScrollArea, Stack, List } from '@mantine/core'
import { computeSemanticSummary, buildSideBySideLines } from '../hooks/useDiff'

const lineStyles = {
  added: { backgroundColor: '#e6ffec', color: '#1a7f37' },
  removed: { backgroundColor: '#ffebe9', color: '#cf222e' },
  pad: { backgroundColor: '#f6f8fa', color: 'transparent' },
  unchanged: {},
}

function DiffLine({ text, type }) {
  return (
    <div style={{
      padding: '0 8px',
      minHeight: '1.4em',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-all',
      ...lineStyles[type],
    }}>
      {text || '\u00A0'}
    </div>
  )
}

export default function DiffModal({ opened, onClose, oldContent, newContent, onConfirm }) {
  const summary = useMemo(
    () => computeSemanticSummary(oldContent, newContent),
    [oldContent, newContent]
  )

  const { leftLines, rightLines } = useMemo(
    () => buildSideBySideLines(oldContent, newContent),
    [oldContent, newContent]
  )

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="保存确认"
      size="xl"
      centered
      styles={{ body: { padding: 0 } }}
    >
      <Stack gap={0}>
        {/* Semantic summary */}
        {summary.length > 0 && (
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--mantine-color-gray-3)' }}>
            <Text size="sm" fw={600} mb={4}>变更摘要</Text>
            <List size="sm" spacing={2}>
              {summary.map((item, i) => (
                <List.Item key={i}>{item}</List.Item>
              ))}
            </List>
          </div>
        )}

        {/* Side-by-side diff */}
        <div style={{ padding: '8px 16px 4px' }}>
          <Text size="sm" fw={600}>文本差异</Text>
        </div>
        <ScrollArea h={400} mx={16} mb={8} style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 'var(--mantine-radius-sm)' }}>
          <div style={{ display: 'flex', fontFamily: 'monospace', fontSize: '0.75rem', lineHeight: 1.4 }}>
            <div style={{ flex: 1, borderRight: '1px solid var(--mantine-color-gray-3)' }}>
              <div style={{ padding: '4px 8px', fontWeight: 600, fontSize: '0.7rem', borderBottom: '1px solid var(--mantine-color-gray-3)', backgroundColor: 'var(--mantine-color-gray-0)' }}>
                原始内容
              </div>
              {leftLines.map((line, i) => <DiffLine key={i} {...line} />)}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ padding: '4px 8px', fontWeight: 600, fontSize: '0.7rem', borderBottom: '1px solid var(--mantine-color-gray-3)', backgroundColor: 'var(--mantine-color-gray-0)' }}>
                当前内容
              </div>
              {rightLines.map((line, i) => <DiffLine key={i} {...line} />)}
            </div>
          </div>
        </ScrollArea>

        {/* Actions — sticky so they stay visible when the summary overflows */}
        <Group
          justify="flex-end"
          px={16}
          py={12}
          style={{
            position: 'sticky',
            bottom: 0,
            backgroundColor: 'var(--mantine-color-body)',
            borderTop: '1px solid var(--mantine-color-gray-3)',
            zIndex: 10,
          }}
        >
          <Button variant="default" size="xs" onClick={onClose}>取消</Button>
          <Button size="xs" onClick={onConfirm}>确认保存</Button>
        </Group>
      </Stack>
    </Modal>
  )
}
