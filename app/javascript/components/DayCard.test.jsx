import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import DayCard from './DayCard'

const baseDay = {
  day: 1,
  title: '抵达乌鲁木齐',
  intensity: 'green',
  km: 0,
  drive: null,
  tags: ['城市'],
  date: '6月15日',
  schedule: [
    { time: '下午', label: '航班抵达' },
    { time: '16:00', label: '打车前往酒店' },
  ],
  tips: '提前预定接机服务',
  food: '大盘鸡',
  stay: '锦江之星',
  ticket: null,
}

describe('DayCard', () => {
  it('renders day badge, title, and meta info', () => {
    render(<DayCard day={baseDay} active={false} onClick={() => {}} />)
    expect(screen.getByText('D1')).toBeInTheDocument()
    expect(screen.getByText('抵达乌鲁木齐')).toBeInTheDocument()
  })

  it('shows schedule and tips when active', () => {
    render(<DayCard day={baseDay} active={true} onClick={() => {}} />)
    expect(screen.getByText('航班抵达')).toBeInTheDocument()
    expect(screen.getByText('提前预定接机服务')).toBeInTheDocument()
    expect(screen.getByText('大盘鸡')).toBeInTheDocument()
    expect(screen.getByText('锦江之星')).toBeInTheDocument()
  })

  it('sets aria-expanded based on active prop', () => {
    const { container } = render(<DayCard day={baseDay} active={true} onClick={() => {}} />)
    const card = container.firstChild
    expect(card.getAttribute('aria-expanded')).toBe('true')
  })

  it('calls onClick when clicked', () => {
    const onClick = vi.fn()
    render(<DayCard day={baseDay} active={false} onClick={onClick} />)
    fireEvent.click(screen.getByText('D1'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('calls onClick on Enter key', () => {
    const onClick = vi.fn()
    const { container } = render(<DayCard day={baseDay} active={false} onClick={onClick} />)
    fireEvent.keyDown(container.firstChild, { key: 'Enter' })
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('calls onClick on Space key', () => {
    const onClick = vi.fn()
    const { container } = render(<DayCard day={baseDay} active={false} onClick={onClick} />)
    fireEvent.keyDown(container.firstChild, { key: ' ' })
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('has role listitem and tabIndex 0', () => {
    const { container } = render(<DayCard day={baseDay} active={false} onClick={() => {}} />)
    const card = container.firstChild
    expect(card.getAttribute('role')).toBe('listitem')
    expect(card.getAttribute('tabindex')).toBe('0')
  })
})
