import { useEffect, useState } from 'react'
import { AppShell as MantineAppShell, Group, ActionIcon, Text, Box } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { usePage } from '@inertiajs/react'
import {
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
} from '@tabler/icons-react'
import SidebarNav from './sidebar/SidebarNav'
import { useSidebarCollapsed } from './sidebar/useSidebarCollapsed'
import { HeaderSlotProvider, useHeaderRightSlot } from './HeaderSlot'

const SITE_SUFFIX_RE = /\s*·\s*OneTour\s*$/

function stripSuffix(t) {
  return t.replace(SITE_SUFFIX_RE, '')
}

function useDocumentTitle() {
  const [title, setTitle] = useState(() =>
    typeof document !== 'undefined' ? stripSuffix(document.title) : ''
  )
  useEffect(() => {
    if (typeof document === 'undefined') return
    setTitle(stripSuffix(document.title))
    // Observe document.head to catch Inertia's title swap (it replaces the
    // <title> element wholesale rather than mutating its children). But only
    // react when document.title actually changes — emotion/Mantine inject many
    // <style> elements into head during normal rendering, and responding to
    // each of those by calling setTitle causes heavy re-renders that can hang
    // jsdom under a test load.
    let lastTitle = document.title
    const observer = new MutationObserver(() => {
      if (document.title === lastTitle) return
      lastTitle = document.title
      setTitle(stripSuffix(document.title))
    })
    observer.observe(document.head, { childList: true, subtree: true, characterData: true })
    return () => observer.disconnect()
  }, [])
  return title
}

function AppShellInner({ children }) {
  const { url, props } = usePage()
  const isAdmin = !!props.current_user?.is_admin
  const currentPath = url.split('?')[0]
  const title = useDocumentTitle()
  const rightSlot = useHeaderRightSlot()

  const { collapsed, toggle } = useSidebarCollapsed()
  const [mobileOpened, { toggle: toggleMobile }] = useDisclosure(false)

  return (
    <MantineAppShell
      header={{ height: 56 }}
      navbar={{
        width: 240,
        breakpoint: 'sm',
        collapsed: { desktop: collapsed, mobile: !mobileOpened },
      }}
      padding="md"
    >
      <MantineAppShell.Header>
        <Group h="100%" px="md" gap="sm" wrap="nowrap">
          <ActionIcon
            onClick={toggle}
            variant="subtle"
            visibleFrom="sm"
            aria-label="toggle sidebar"
          >
            {collapsed
              ? <IconLayoutSidebarLeftExpand size={20} />
              : <IconLayoutSidebarLeftCollapse size={20} />}
          </ActionIcon>
          <ActionIcon
            onClick={toggleMobile}
            variant="subtle"
            hiddenFrom="sm"
            aria-label="toggle sidebar mobile"
          >
            {mobileOpened
              ? <IconLayoutSidebarLeftCollapse size={20} />
              : <IconLayoutSidebarLeftExpand size={20} />}
          </ActionIcon>
          <Text fw={600} size="sm">{title}</Text>
          <Box style={{ flex: 1 }} />
          {rightSlot}
        </Group>
      </MantineAppShell.Header>

      <MantineAppShell.Navbar p={0}>
        <SidebarNav currentPath={currentPath} isAdmin={isAdmin} />
      </MantineAppShell.Navbar>

      <MantineAppShell.Main>{children}</MantineAppShell.Main>
    </MantineAppShell>
  )
}

export default function AppShell({ children }) {
  return (
    <HeaderSlotProvider>
      <AppShellInner>{children}</AppShellInner>
    </HeaderSlotProvider>
  )
}
