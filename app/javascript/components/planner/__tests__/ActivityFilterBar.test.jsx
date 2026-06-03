import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { MantineProvider } from '@mantine/core'
import ActivityFilterBar from '../ActivityFilterBar'

const members = [
  { user_id: 1, name: 'Alice', avatar_url: null },
  { user_id: 2, name: 'Bob',   avatar_url: null },
]
const author = { user_id: 1, name: 'Alice', avatar_url: null }

function renderBar(props = {}) {
  const defaultProps = {
    filter: { q: '', kind: [], uids: [], status: [], levels: [], reserve: false },
    setQ: vi.fn(),
    setKind: vi.fn(),
    setUids: vi.fn(),
    setStatus: vi.fn(),
    setLevels: vi.fn(),
    setReserve: vi.fn(),
    reset: vi.fn(),
    active: false,
    activeCount: 10,
    totalCount: 10,
    members,
    author,
  }
  return render(
    <MantineProvider>
      <ActivityFilterBar {...defaultProps} {...props} />
    </MantineProvider>
  )
}

// Opens the popover (all controls live inside) and returns the user-event session.
async function openPopover() {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: /筛选/ }))
  // Wait for one of the popover contents to confirm it's mounted.
  await screen.findByText('类型')
  return user
}

describe('ActivityFilterBar', () => {
  it('renders only the filter icon button in the header', () => {
    renderBar()
    expect(screen.getByRole('button', { name: /筛选/ })).toBeInTheDocument()
    // Search input, count, reset should NOT be rendered until the popover opens.
    expect(screen.queryByLabelText('搜索活动')).not.toBeInTheDocument()
    expect(screen.queryByText(/^\d+\s*\/\s*\d+$/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '重置' })).not.toBeInTheDocument()
  })

  it('opens popover on click and reveals search / type / participants / count', async () => {
    renderBar()
    await openPopover()
    expect(await screen.findByLabelText('搜索活动')).toBeInTheDocument()
    expect(screen.getByText('景点')).toBeInTheDocument()
    expect(screen.getByText('景观公路')).toBeInTheDocument()
    expect(screen.getByText('餐饮')).toBeInTheDocument()
    expect(screen.getByText('住宿')).toBeInTheDocument()
    expect(screen.getByText('加油')).toBeInTheDocument()
    expect(screen.getByText('其他')).toBeInTheDocument()
    expect(screen.getByText('10 / 10')).toBeInTheDocument()
  })

  it('reset button is hidden inside popover when not active', async () => {
    renderBar({ active: false })
    await openPopover()
    expect(screen.queryByRole('button', { name: '重置' })).not.toBeInTheDocument()
  })

  it('reset button appears inside popover when active, and clicking it fires reset()', async () => {
    const reset = vi.fn()
    renderBar({ active: true, activeCount: 3, reset })
    const user = await openPopover()
    expect(screen.getByText('3 / 10')).toBeInTheDocument()
    const resetLabel = await screen.findByText('重置')
    await user.click(resetLabel)
    expect(reset).toHaveBeenCalled()
  })

  it('typing in popover search calls setQ', async () => {
    const setQ = vi.fn()
    renderBar({ setQ })
    const user = await openPopover()
    await user.type(screen.getByLabelText('搜索活动'), '餐')
    expect(setQ).toHaveBeenCalledWith('餐')
  })

  it('filter.q controls popover input value', async () => {
    renderBar({ filter: { q: '赛里木', kind: [], uids: [], status: [], levels: [], reserve: false } })
    await openPopover()
    expect(screen.getByLabelText('搜索活动')).toHaveValue('赛里木')
  })

  it('clicking a Kind chip calls setKind with updated list', async () => {
    const setKind = vi.fn()
    renderBar({ setKind })
    const user = await openPopover()
    await user.click(screen.getByText('餐饮'))
    expect(setKind).toHaveBeenCalledWith(['food'])
  })

  it('popover lists participants (author + members, deduplicated)', async () => {
    renderBar()
    await openPopover()
    // Author is Alice (user_id=1); members include Alice and Bob.
    // Alice should appear exactly once despite being in both.
    expect(screen.getAllByText(/Alice/).length).toBe(1)
    expect(screen.getByText('Bob')).toBeInTheDocument()
  })

  it('popover reveals 重点层级 / 状态 / 需预约 sections', async () => {
    renderBar()
    await openPopover()
    expect(screen.getByText('重点层级')).toBeInTheDocument()
    expect(screen.getByText('必去')).toBeInTheDocument()
    expect(screen.getByText('想去')).toBeInTheDocument()
    expect(screen.getByText('备选')).toBeInTheDocument()
    expect(screen.getByText('后勤')).toBeInTheDocument()
    expect(screen.getByText('状态')).toBeInTheDocument()
    expect(screen.getByText('已定')).toBeInTheDocument()
    expect(screen.getByText('待定')).toBeInTheDocument()
    expect(screen.getByText('暂停开放')).toBeInTheDocument()
    expect(screen.getByText('仅看需预约')).toBeInTheDocument()
  })

  it('clicking a 状态 chip calls setStatus', async () => {
    const setStatus = vi.fn()
    renderBar({ setStatus })
    const user = await openPopover()
    await user.click(screen.getByText('待定'))
    expect(setStatus).toHaveBeenCalledWith(['pending'])
  })

  it('clicking a 重点层级 chip calls setLevels', async () => {
    const setLevels = vi.fn()
    renderBar({ setLevels })
    const user = await openPopover()
    await user.click(screen.getByText('必去'))
    expect(setLevels).toHaveBeenCalledWith(['tier_one'])
  })

  it('toggling 需预约 checkbox calls setReserve(true)', async () => {
    const setReserve = vi.fn()
    renderBar({ setReserve })
    const user = await openPopover()
    await user.click(screen.getByText('仅看需预约'))
    expect(setReserve).toHaveBeenCalledWith(true)
  })

  it('filter-active prop toggles the Mantine Indicator dot visibility', () => {
    // Inactive: Mantine Indicator doesn't render its `.mantine-Indicator-indicator`
    // child element at all. Active: it renders one. Observing presence is the
    // most stable signal for the "active state badge" across Mantine versions.
    const base = {
      setQ: vi.fn(), setKind: vi.fn(), setUids: vi.fn(),
      setStatus: vi.fn(), setLevels: vi.fn(), setReserve: vi.fn(),
      reset: vi.fn(),
      activeCount: 10, totalCount: 10, members, author,
    }
    const { rerender } = render(
      <MantineProvider>
        <ActivityFilterBar filter={{ q: '', kind: [], uids: [], status: [], levels: [], reserve: false }} active={false} {...base} />
      </MantineProvider>
    )
    expect(document.querySelector('.mantine-Indicator-indicator')).toBeNull()

    rerender(
      <MantineProvider>
        <ActivityFilterBar filter={{ q: '餐', kind: [], uids: [], status: [], levels: [], reserve: false }} active={true} {...base} />
      </MantineProvider>
    )
    expect(document.querySelector('.mantine-Indicator-indicator')).not.toBeNull()
  })
})
