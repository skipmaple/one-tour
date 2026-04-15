import { render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
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
