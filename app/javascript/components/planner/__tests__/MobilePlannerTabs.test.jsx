import { render, screen, fireEvent } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { describe, it, expect, vi } from 'vitest'
import MobilePlannerTabs from '../MobilePlannerTabs'

const r = (ui) => render(<MantineProvider>{ui}</MantineProvider>)

describe('MobilePlannerTabs', () => {
  it('renders four labelled tabs', () => {
    r(<MobilePlannerTabs active="days" onChange={() => {}} />)
    ;['候选', '日程', '地图', 'AI'].forEach(l => expect(screen.getByRole('button', { name: l })).toBeInTheDocument())
  })
  it('fires onChange with the tab id', () => {
    const onChange = vi.fn()
    r(<MobilePlannerTabs active="days" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: '地图' }))
    expect(onChange).toHaveBeenCalledWith('map')
  })
})
