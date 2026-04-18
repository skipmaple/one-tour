import { render, screen, fireEvent } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { vi } from 'vitest'

// Mock the schema module with controlled fixtures so tests are isolated from
// real detailsSchema changes.
vi.mock('../detailsSchema', () => ({
  KIND_SCHEMA: {
    scenic: [
      { key: 'altitude', label: '海拔', type: 'number_with_suffix', suffix: '米' },
      { key: 'planned_min', label: '建议停留', type: 'number_with_suffix', suffix: '分钟', presets: [30, 60, 90] },
    ],
    food: [
      { key: 'cuisine', label: '菜系', type: 'autocomplete', suggestions: ['甘肃菜', '川菜', '粤菜'] },
      { key: 'must_eat', label: '必吃', type: 'text' },
    ],
    other: [],
  },
}))

import DetailsFields from '../DetailsFields'

function renderFields(kind, details = {}, onChange = vi.fn()) {
  return render(
    <MantineProvider>
      <DetailsFields kind={kind} details={details} onChange={onChange} />
    </MantineProvider>,
  )
}

test('renders nothing when kind has empty schema', () => {
  const { container } = renderFields('other')
  expect(container.querySelectorAll('input')).toHaveLength(0)
})

test('number_with_suffix renders NumberInput with suffix displayed', () => {
  renderFields('scenic', { altitude: 2500 })
  expect(screen.getByLabelText('海拔', { exact: false })).toHaveValue('2500')
  expect(screen.getByText('米')).toBeInTheDocument()
})

test('number_with_suffix with presets renders PresetChips that call onChange', () => {
  const onChange = vi.fn()
  renderFields('scenic', {}, onChange)
  fireEvent.click(screen.getByRole('button', { name: '60' }))
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ planned_min: 60 }))
})

test('autocomplete type renders and allows free input', () => {
  const onChange = vi.fn()
  renderFields('food', {}, onChange)
  const input = screen.getByRole('combobox', { name: /菜系/i })
  fireEvent.change(input, { target: { value: '湘菜' } })
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ cuisine: '湘菜' }))
})

test('legacy text field still renders (no regression)', () => {
  renderFields('food', {})
  expect(screen.getByLabelText('必吃', { exact: false })).toBeInTheDocument()
})
