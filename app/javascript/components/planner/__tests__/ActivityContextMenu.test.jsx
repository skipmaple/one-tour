import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import ActivityContextMenu from '../ActivityContextMenu'

function renderMenu(activity, overrides = {}) {
  const props = {
    state: { activity, x: 100, y: 100 },
    onClose: vi.fn(),
    onEdit: vi.fn(),
    onAddExpense: vi.fn(),
    onClone: vi.fn(),
    onMoveToBacklog: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  }
  render(
    <MantineProvider>
      <ActivityContextMenu {...props} />
    </MantineProvider>
  )
  return props
}

describe('ActivityContextMenu', () => {
  test('in-day activity shows all five items', () => {
    renderMenu({ id: 1, day_id: 10 })
    expect(screen.getByText('编辑')).toBeInTheDocument()
    expect(screen.getByText('记账')).toBeInTheDocument()
    expect(screen.getByText('克隆')).toBeInTheDocument()
    expect(screen.getByText('移到候选池')).toBeInTheDocument()
    expect(screen.getByText('删除')).toBeInTheDocument()
  })

  test('backlog activity (day_id null) hides 记账 and 移到候选池', () => {
    renderMenu({ id: 2, day_id: null })
    expect(screen.getByText('编辑')).toBeInTheDocument()
    expect(screen.getByText('克隆')).toBeInTheDocument()
    expect(screen.getByText('删除')).toBeInTheDocument()
    expect(screen.queryByText('记账')).not.toBeInTheDocument()
    expect(screen.queryByText('移到候选池')).not.toBeInTheDocument()
  })

  test('clicking an item invokes its handler with the activity id and closes', () => {
    const props = renderMenu({ id: 7, day_id: 10 })
    fireEvent.click(screen.getByText('克隆'))
    expect(props.onClone).toHaveBeenCalledWith(7)
    expect(props.onClose).toHaveBeenCalled()
  })

  test('clicking 删除 invokes onDelete with the activity id and closes', () => {
    const props = renderMenu({ id: 3, day_id: 10 })
    fireEvent.click(screen.getByText('删除'))
    expect(props.onDelete).toHaveBeenCalledWith(3)
    expect(props.onClose).toHaveBeenCalled()
  })

  test('renders nothing interactive when state is null (closed)', () => {
    renderMenu(null, { state: null })
    expect(screen.queryByText('编辑')).not.toBeInTheDocument()
  })
})
