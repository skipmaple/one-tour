import { useState } from 'react'
import { useMediaQuery } from '@mantine/hooks'
import { Group, TextInput, ActionIcon, Popover, Stack, Chip, Checkbox, Badge, Button, Indicator, Avatar, Divider, Tooltip } from '@mantine/core'
import {
  IconSearch, IconFilter, IconX,
  IconMountain, IconRoad, IconToolsKitchen2, IconBed, IconGasStation, IconDots,
} from '@tabler/icons-react'
import { KIND_OPTIONS as CANONICAL_KIND_OPTIONS } from '../activity-editor/detailsSchema'

// Labels live in the activity editor's schema (single source of truth so
// filter Chip text matches the editor's Select options). Icons are a UI
// concern specific to the filter bar.
const KIND_ICONS = {
  scenic: IconMountain,
  road:   IconRoad,
  food:   IconToolsKitchen2,
  stay:   IconBed,
  fuel:   IconGasStation,
  other:  IconDots,
}
const KIND_OPTIONS = CANONICAL_KIND_OPTIONS.map(o => ({ ...o, Icon: KIND_ICONS[o.value] }))

export default function ActivityFilterBar({
  filter, setQ, setKind, setUids, reset,
  active, activeCount, totalCount,
  members, author,
}) {
  const isMobile = useMediaQuery('(max-width: 640px)')
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)

  const allPeople = [
    { user_id: author.user_id, name: author.name, avatar_url: author.avatar_url, isAuthor: true },
    ...members
      .filter(m => m.user_id !== author.user_id)
      .map(m => ({ user_id: m.user_id, name: m.name, avatar_url: m.avatar_url, isAuthor: false })),
  ]

  const toggleUid = (uid) => {
    if (filter.uids.includes(uid)) {
      setUids(filter.uids.filter(u => u !== uid))
    } else {
      setUids([...filter.uids, uid])
    }
  }

  return (
    <Group gap="xs" wrap="nowrap">
      <Divider orientation="vertical" />

      {!isMobile && (
        <TextInput
          size="xs"
          w={180}
          value={filter.q}
          onChange={e => setQ(e.currentTarget.value)}
          placeholder="搜索活动名或备注"
          leftSection={<IconSearch size={14} />}
          rightSection={filter.q ? (
            <ActionIcon variant="subtle" size="xs" onClick={() => setQ('')} aria-label="清空搜索">
              <IconX size={12} />
            </ActionIcon>
          ) : null}
          aria-label="搜索活动"
        />
      )}

      {isMobile && (
        <Popover
          opened={searchOpen}
          onChange={setSearchOpen}
          position="bottom-start"
          width={260}
          withArrow
        >
          <Popover.Target>
            <Tooltip label="搜索" withArrow>
              <ActionIcon
                variant={filter.q ? 'light' : 'subtle'}
                size="md"
                onClick={() => setSearchOpen(o => !o)}
                aria-label="搜索"
              >
                <IconSearch size={16} />
              </ActionIcon>
            </Tooltip>
          </Popover.Target>
          <Popover.Dropdown>
            <TextInput
              size="xs"
              value={filter.q}
              onChange={e => setQ(e.currentTarget.value)}
              placeholder="搜索活动名或备注"
              leftSection={<IconSearch size={14} />}
              rightSection={filter.q ? (
                <ActionIcon variant="subtle" size="xs" onClick={() => setQ('')} aria-label="清空搜索">
                  <IconX size={12} />
                </ActionIcon>
              ) : null}
              aria-label="搜索活动"
            />
          </Popover.Dropdown>
        </Popover>
      )}

      <Popover
        opened={popoverOpen}
        onChange={setPopoverOpen}
        position="bottom-start"
        width={280}
        withArrow
        shadow="md"
      >
        <Popover.Target>
          <Indicator color="red" size={8} offset={4} disabled={!active}>
            <Tooltip label="筛选" withArrow>
              <ActionIcon
                variant={active ? 'light' : 'subtle'}
                size="md"
                onClick={() => setPopoverOpen(o => !o)}
                aria-label="筛选"
              >
                <IconFilter size={16} />
              </ActionIcon>
            </Tooltip>
          </Indicator>
        </Popover.Target>

        <Popover.Dropdown>
          <Stack gap="sm">
            <div>
              <div style={{ fontSize: 12, color: 'var(--mantine-color-gray-7)', marginBottom: 6 }}>类型</div>
              <Chip.Group multiple value={filter.kind} onChange={setKind}>
                <Group gap={4}>
                  {KIND_OPTIONS.map(({ value, label, Icon }) => (
                    <Chip key={value} value={value} size="xs">
                      <Group gap={4} wrap="nowrap">
                        <Icon size={12} />
                        <span>{label}</span>
                      </Group>
                    </Chip>
                  ))}
                </Group>
              </Chip.Group>
            </div>

            <div>
              <div style={{ fontSize: 12, color: 'var(--mantine-color-gray-7)', marginBottom: 6 }}>参与人</div>
              <Stack gap={4}>
                {allPeople.map(p => (
                  <Checkbox
                    key={p.user_id}
                    size="xs"
                    checked={filter.uids.includes(p.user_id)}
                    onChange={() => toggleUid(p.user_id)}
                    label={
                      <Group gap={6} wrap="nowrap">
                        <Avatar src={p.avatar_url} size={18} radius="xl" />
                        <span>{p.name}{p.isAuthor ? '（作者）' : ''}</span>
                      </Group>
                    }
                  />
                ))}
              </Stack>
            </div>
          </Stack>
        </Popover.Dropdown>
      </Popover>

      {active && (
        <>
          <Badge size="sm" variant="light" color="blue">{activeCount} / {totalCount}</Badge>
          <Button
            size="compact-xs"
            variant="subtle"
            onClick={reset}
            leftSection={<IconX size={12} />}
          >
            重置
          </Button>
        </>
      )}
    </Group>
  )
}
