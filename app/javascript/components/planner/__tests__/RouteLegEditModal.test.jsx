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

  // Regression: Number('') === 0. Clearing an input should NOT write a
  // zero-km override; it should send null so effective_* falls back to AMAP.
  it('sends null for emptied override fields (not 0)', async () => {
    global.fetch.mockResolvedValue({ ok: true })
    render(<MantineProvider><RouteLegEditModal opened={true} leg={leg} onClose={vi.fn()} /></MantineProvider>)
    const kmInput = screen.getByDisplayValue('118')
    fireEvent.change(kmInput, { target: { value: '' } })
    fireEvent.click(screen.getByText('保存'))
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    const body = JSON.parse(global.fetch.mock.calls[0][1].body)
    expect(body.route_leg.distance_m_override).toBeNull()
    expect(body.route_leg.duration_s_override).toBe(145 * 60)  // durMin untouched
  })

  it('disables Save when both numeric inputs cleared and note empty', () => {
    render(<MantineProvider><RouteLegEditModal opened={true} leg={leg} onClose={vi.fn()} /></MantineProvider>)
    fireEvent.change(screen.getByDisplayValue('118'), { target: { value: '' } })
    fireEvent.change(screen.getByDisplayValue('145'), { target: { value: '' } })
    const saveBtn = screen.getByRole('button', { name: '保存' })
    expect(saveBtn).toBeDisabled()
  })
})
