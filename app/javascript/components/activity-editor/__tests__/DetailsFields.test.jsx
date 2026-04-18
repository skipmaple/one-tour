import { render, screen, fireEvent } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { vi } from 'vitest'

// Mock the schema module with controlled fixtures so tests are isolated from
// real detailsSchema changes.
vi.mock('../detailsSchema', () => ({
  KIND_SCHEMA: {
    scenic: [
      { key: 'altitude', label: '海拔', type: 'number_with_suffix', suffix: '米', row: 'scenic-nums' },
      { key: 'planned_min', label: '建议停留', type: 'number_with_suffix', suffix: '分钟', presets: [30, 60, 90], row: 'scenic-nums' },
      { key: 'ticket', label: '门票', type: 'number_with_suffix', suffix: '元' },
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
  // aria-label 是「设置 建议停留 为 60」，用 regex 匹配数字
  fireEvent.click(screen.getByRole('button', { name: /建议停留 为 60/ }))
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ planned_min: 60 }))
})

test('fields sharing a row id render in a single Group (paired)', () => {
  renderFields('scenic', { altitude: 2500, planned_min: 75 })
  // Exact match avoids colliding with preset-chip aria-labels that include
  // the field name as substring.
  const altitudeInput = screen.getByLabelText('海拔', { exact: true })
  const plannedInput = screen.getByLabelText('建议停留', { exact: true })
  const nearestGroup = (el) => el.closest('[class*="Group-root"]')
  expect(nearestGroup(altitudeInput)).not.toBeNull()
  expect(nearestGroup(altitudeInput)).toBe(nearestGroup(plannedInput))
})

test('fields without row id render solo (not in a pair group)', () => {
  renderFields('scenic', { ticket: 50 })
  const ticketInput = screen.getByLabelText('门票', { exact: true })
  const altitudeInput = screen.getByLabelText('海拔', { exact: true })
  const nearestGroup = (el) => el.closest('[class*="Group-root"]')
  // ticket has no row → its nearest Group is NOT the same as altitude's (paired).
  expect(nearestGroup(ticketInput)).not.toBe(nearestGroup(altitudeInput))
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
