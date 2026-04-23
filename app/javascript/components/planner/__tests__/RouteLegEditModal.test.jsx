import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { vi, beforeEach } from 'vitest'
import RouteLegEditModal from '../RouteLegEditModal'

vi.mock('@inertiajs/react', () => ({ router: { reload: vi.fn() } }))
global.fetch = vi.fn()
beforeEach(() => global.fetch.mockReset())

const leg = {
  id: 1, from_activity_name: '兰州', to_activity_name: '刘家峡',
  distance_m: 118000, duration_s: 8700,
  distance_m_override: null, duration_s_override: null, note: null, overridden_at: null
}

describe('RouteLegEditModal', () => {
  it('pre-fills inputs from AMAP values when no override', () => {
    render(<MantineProvider><RouteLegEditModal opened={true} leg={leg} onClose={vi.fn()} /></MantineProvider>)
    expect(screen.getByDisplayValue('118')).toBeInTheDocument()  // km rounded
    expect(screen.getByDisplayValue('145')).toBeInTheDocument()  // min rounded (8700/60)
  })

  it('saves via PATCH and closes', async () => {
    global.fetch.mockResolvedValue({ ok: true })
    const onClose = vi.fn()
    render(<MantineProvider><RouteLegEditModal opened={true} leg={leg} onClose={onClose} /></MantineProvider>)
    fireEvent.click(screen.getByText('保存'))
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      '/route_legs/1', expect.objectContaining({ method: 'PATCH' })
    ))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('reset calls DELETE', async () => {
    global.fetch.mockResolvedValue({ ok: true })
    render(<MantineProvider><RouteLegEditModal opened={true} leg={leg} onClose={vi.fn()} /></MantineProvider>)
    fireEvent.click(screen.getByText(/重置为高德/))
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      '/route_legs/1', expect.objectContaining({ method: 'DELETE' })
    ))
  })
})
