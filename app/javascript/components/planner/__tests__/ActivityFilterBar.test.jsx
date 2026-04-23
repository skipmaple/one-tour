import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MantineProvider } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import ActivityFilterBar from '../ActivityFilterBar'

vi.mock('@mantine/hooks', async () => {
  const actual = await vi.importActual('@mantine/hooks')
  return {
    ...actual,
    useMediaQuery: vi.fn(),
  }
})

const members = [
  { user_id: 1, name: 'Alice', avatar_url: null },
  { user_id: 2, name: 'Bob',   avatar_url: null },
]
const author = { user_id: 1, name: 'Alice', avatar_url: null }

function renderBar(props = {}) {
  const defaultProps = {
    filter: { q: '', kind: [], uids: [] },
    setQ: vi.fn(),
    setKind: vi.fn(),
    setUids: vi.fn(),
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

describe('ActivityFilterBar', () => {
  beforeEach(() => {
    useMediaQuery.mockReturnValue(false) // desktop default
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders search input and filter icon button', () => {
    renderBar()
    expect(screen.getByRole('textbox', { name: /搜索活动/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /筛选/ })).toBeInTheDocument()
  })

  it('hides count badge and reset button when no filter active', () => {
    renderBar({ active: false })
    expect(screen.queryByText(/^\d+\s*\/\s*\d+$/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '重置' })).not.toBeInTheDocument()
  })

  it('shows count "X / Y" and reset button when filter active', () => {
    renderBar({ active: true, activeCount: 3, totalCount: 10 })
    expect(screen.getByText('3 / 10')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重置' })).toBeInTheDocument()
  })

  it('typing in search calls setQ', () => {
    const setQ = vi.fn()
    renderBar({ setQ })
    fireEvent.change(screen.getByRole('textbox', { name: /搜索活动/ }), {
      target: { value: '餐' },
    })
    expect(setQ).toHaveBeenCalledWith('餐')
  })

  it('filter.q controls input value (controlled component)', () => {
    renderBar({ filter: { q: '赛里木', kind: [], uids: [] } })
    expect(screen.getByRole('textbox', { name: /搜索活动/ })).toHaveValue('赛里木')
  })

  it('clicking reset calls reset()', () => {
    const reset = vi.fn()
    renderBar({ active: true, reset })
    fireEvent.click(screen.getByRole('button', { name: '重置' }))
    expect(reset).toHaveBeenCalled()
  })

  it('opens popover and shows Kind chips when filter button clicked', async () => {
    const user = userEvent.setup()
    renderBar()
    await user.click(screen.getByRole('button', { name: /筛选/ }))
    expect(await screen.findByText('景点')).toBeInTheDocument()
    expect(screen.getByText('路段')).toBeInTheDocument()
    expect(screen.getByText('餐饮')).toBeInTheDocument()
    expect(screen.getByText('住宿')).toBeInTheDocument()
    expect(screen.getByText('加油')).toBeInTheDocument()
    expect(screen.getByText('其他')).toBeInTheDocument()
  })

  it('popover clicks on Kind chip call setKind with updated list', async () => {
    const user = userEvent.setup()
    const setKind = vi.fn()
    renderBar({ setKind })
    await user.click(screen.getByRole('button', { name: /筛选/ }))
    await user.click(await screen.findByText('餐饮'))
    expect(setKind).toHaveBeenCalledWith(['food'])
  })

  it('popover lists participants (author + members, deduplicated)', async () => {
    const user = userEvent.setup()
    renderBar()
    await user.click(screen.getByRole('button', { name: /筛选/ }))
    // Author is Alice (user_id=1); members include Alice and Bob.
    // Alice should appear exactly once despite being in both.
    await screen.findByText('Bob')
    expect(screen.getAllByText(/Alice/).length).toBe(1)
    expect(screen.getByText('Bob')).toBeInTheDocument()
  })
})

describe('ActivityFilterBar · mobile', () => {
  beforeEach(() => {
    useMediaQuery.mockReturnValue(true)
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('collapses search to icon button on mobile', () => {
    renderBar()
    expect(screen.queryByRole('textbox', { name: /搜索活动/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /搜索/ })).toBeInTheDocument()
  })

  it('clicking mobile search icon opens popover with search input', async () => {
    const user = userEvent.setup()
    renderBar()
    await user.click(screen.getByRole('button', { name: /搜索/ }))
    expect(await screen.findByRole('textbox', { name: /搜索活动/ })).toBeInTheDocument()
  })
})
