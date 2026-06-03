import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MantineProvider } from '@mantine/core'
import { vi } from 'vitest'
import ConstitutionBanner from '../ConstitutionBanner'

function renderWithMantine(ui) {
  return render(<MantineProvider>{ui}</MantineProvider>)
}

test('renders nothing when no violations', () => {
  const { container } = renderWithMantine(<ConstitutionBanner violations={[]} />)
  expect(container.querySelector('[role="status"]')).not.toBeInTheDocument()
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})

test('renders a hard violation with 帮我修正 button', () => {
  renderWithMantine(<ConstitutionBanner violations={[
    { level: 'hard', rule: 'max_daily_driving_minutes', scope: { day_index: 3 }, message: 'D3 驾驶超时' }
  ]} />)
  expect(screen.getByText(/D3 驾驶超时/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /帮我修正/ })).toBeInTheDocument()
})

test('renders a soft violation with 知道了 button', () => {
  renderWithMantine(<ConstitutionBanner violations={[
    { level: 'soft', rule: 'min_buffer_days', scope: {}, message: '机动日不足' }
  ]} />)
  expect(screen.getByText(/机动日不足/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '知道了' })).toBeInTheDocument()
})

test('fires onFix when 帮我修正 clicked', () => {
  const onFix = vi.fn()
  const violation = { level: 'hard', rule: 'r', scope: {}, message: 'hard issue' }
  renderWithMantine(<ConstitutionBanner violations={[violation]} onFix={onFix} />)
  fireEvent.click(screen.getByRole('button', { name: /帮我修正/ }))
  expect(onFix).toHaveBeenCalledWith(violation)
})

test('fires onAcknowledge when 承认此违反 clicked on a hard violation', () => {
  const onAcknowledge = vi.fn()
  const violation = { level: 'hard', rule: 'r', scope: {}, message: 'hard issue' }
  renderWithMantine(<ConstitutionBanner violations={[violation]} onAcknowledge={onAcknowledge} />)
  fireEvent.click(screen.getByRole('button', { name: '承认此违反' }))
  expect(onAcknowledge).toHaveBeenCalledWith(violation)
})

test('dismisses soft violation locally when 知道了 clicked', () => {
  const onDismiss = vi.fn()
  const violation = { level: 'soft', rule: 'r', scope: {}, message: 'soft issue' }
  renderWithMantine(<ConstitutionBanner violations={[violation]} onDismiss={onDismiss} />)
  fireEvent.click(screen.getByRole('button', { name: '知道了' }))
  expect(onDismiss).toHaveBeenCalledWith(violation)
  expect(screen.queryByText(/soft issue/)).not.toBeInTheDocument()
})

test('hard violation: 承认此违反 button has an explanatory tooltip', async () => {
  const user = userEvent.setup()
  renderWithMantine(<ConstitutionBanner violations={[{ level: 'hard', rule: 'x', message: '超了' }]} onAcknowledge={vi.fn()} />)
  await user.hover(screen.getByRole('button', { name: '承认此违反' }))
  expect(await screen.findByText(/记录一条豁免/)).toBeInTheDocument()
})

test('violation level icon has a soft/hard explanatory tooltip', async () => {
  const user = userEvent.setup()
  renderWithMantine(<ConstitutionBanner violations={[{ level: 'hard', rule: 'x', message: '超了' }]} />)
  await user.hover(screen.getByTestId('violation-level-icon'))
  expect(await screen.findByText(/软提示=建议/)).toBeInTheDocument()
})

test('hides 帮我修正 and 承认此违反 when readOnly', () => {
  renderWithMantine(<ConstitutionBanner
    violations={[{ level: 'hard', rule: 'r', scope: {}, message: 'hard issue' }]}
    readOnly
  />)
  expect(screen.queryByRole('button', { name: /帮我修正/ })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '承认此违反' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '知道了' })).toBeInTheDocument()
})
