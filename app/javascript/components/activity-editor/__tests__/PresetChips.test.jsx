import { render, screen, fireEvent } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { vi } from 'vitest'
import PresetChips from '../PresetChips'

function renderChips(props = {}) {
  return render(
    <MantineProvider>
      <PresetChips values={[30, 60, 90]} onPick={vi.fn()} {...props} />
    </MantineProvider>,
  )
}

test('renders a button for each preset value', () => {
  renderChips()
  expect(screen.getByRole('button', { name: '30' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '60' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '90' })).toBeInTheDocument()
})

test('calls onPick with the value when a chip is clicked', () => {
  const onPick = vi.fn()
  renderChips({ onPick })
  fireEvent.click(screen.getByRole('button', { name: '60' }))
  expect(onPick).toHaveBeenCalledWith(60)
})

test('renders nothing when values is empty', () => {
  const { container } = renderChips({ values: [] })
  expect(container.querySelectorAll('button')).toHaveLength(0)
})

test('attaches aria-label on each button when ariaLabelPrefix is given', () => {
  renderChips({ ariaLabelPrefix: '时长' })
  expect(screen.getByRole('button', { name: '设置 时长 为 30' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '设置 时长 为 60' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '设置 时长 为 90' })).toBeInTheDocument()
})

test('without ariaLabelPrefix, accessible name falls back to chip text', () => {
  renderChips()
  // no aria-label → accessible name = chip text
  expect(screen.getByRole('button', { name: '60' })).toBeInTheDocument()
})
