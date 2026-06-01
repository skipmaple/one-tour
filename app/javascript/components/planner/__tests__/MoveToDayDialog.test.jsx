import { render, screen, fireEvent } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { describe, it, expect, vi } from 'vitest'
import MoveToDayDialog from '../MoveToDayDialog'

const r = (ui) => render(<MantineProvider>{ui}</MantineProvider>)

describe('MoveToDayDialog', () => {
  it('lists days and picks one with end position', () => {
    const onPick = vi.fn(); const onClose = vi.fn()
    r(<MoveToDayDialog opened onClose={onClose} days={[{ id: 5, day_index: 1, title: '都江堰' }, { id: 6, day_index: 2, title: '' }]} byDay={{ 5: [{}, {}], 6: [] }} onPick={onPick} />)
    fireEvent.click(screen.getByRole('button', { name: /D1.*都江堰/ }))
    expect(onPick).toHaveBeenCalledWith(5, 3) // 2 existing → end position 3
  })
})
