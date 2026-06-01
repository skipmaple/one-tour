import { Menu } from '@mantine/core'
import {
  IconPencil,
  IconCoin,
  IconCopy,
  IconCalendarPlus,
  IconInbox,
  IconTrash,
} from '@tabler/icons-react'

// 所有 ActivityCard 共用的单一受控右键菜单。`state` 携带目标 activity 和光标
// 坐标用于锚定；null = 关闭。菜单项按上下文自适应：候选池卡片（day_id == null）
// 隐藏"记账"和"移到候选池"。
export default function ActivityContextMenu({
  state,
  onClose,
  onEdit,
  onAddExpense,
  onClone,
  onMoveToDay,
  onMoveToBacklog,
  onDelete,
}) {
  const activity = state?.activity
  const inDay = !!activity?.day_id

  const run = (fn) => () => {
    if (activity && fn) fn(activity.id)
    onClose()
  }

  return (
    <Menu
      opened={!!state}
      onChange={(opened) => { if (!opened) onClose() }}
      position="right-start"
      offset={4}
      width={180}
      shadow="md"
      withinPortal
    >
      <Menu.Target>
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            left: state?.x ?? 0,
            top: state?.y ?? 0,
            width: 0,
            height: 0,
          }}
        />
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item leftSection={<IconPencil size={15} />} onClick={run(onEdit)}>
          编辑
        </Menu.Item>
        {inDay && (
          <Menu.Item leftSection={<IconCoin size={15} />} onClick={run(onAddExpense)}>
            记账
          </Menu.Item>
        )}
        <Menu.Item leftSection={<IconCopy size={15} />} onClick={run(onClone)}>
          克隆
        </Menu.Item>
        {onMoveToDay && (
          <Menu.Item leftSection={<IconCalendarPlus size={15} />} onClick={run(onMoveToDay)}>
            {inDay ? '移到其他天' : '加入日程'}
          </Menu.Item>
        )}
        <Menu.Divider />
        {inDay && (
          <Menu.Item leftSection={<IconInbox size={15} />} onClick={run(onMoveToBacklog)}>
            移到候选池
          </Menu.Item>
        )}
        <Menu.Item color="red" leftSection={<IconTrash size={15} />} onClick={run(onDelete)}>
          删除
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  )
}
