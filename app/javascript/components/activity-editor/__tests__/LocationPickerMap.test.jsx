import { render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { beforeEach, describe, it, expect, vi } from 'vitest'
import LocationPickerMap from '../LocationPickerMap'

// Mock useAmap to "ready" so AMap.Map code path runs
vi.mock('../../../hooks/useAmap', () => ({
  default: () => 'ready'
}))
vi.mock('@inertiajs/react', () => ({
  usePage: () => ({ props: { amap_js_api_key: 'k', amap_js_security_code: 's' } })
}))

// Stub window.AMap with a minimal spy API
const markerSetPosition = vi.fn()
const markerOn = vi.fn()
const mapOn = vi.fn()
beforeEach(() => {
  markerSetPosition.mockClear()
  markerOn.mockClear()
  mapOn.mockClear()
  window.AMap = {
    Map: vi.fn().mockImplementation(function () { return { destroy: vi.fn(), on: mapOn, setCenter: vi.fn() } }),
    Marker: vi.fn().mockImplementation(function () {
      return { setMap: vi.fn(), setPosition: markerSetPosition, on: markerOn }
    })
  }
})

const renderWrap = (props) => render(
  <MantineProvider><LocationPickerMap {...props} /></MantineProvider>
)

describe('LocationPickerMap', () => {
  it('renders container when SDK ready', () => {
    const { container } = renderWrap({ lat: 42.9, lng: 83.5, onMove: vi.fn() })
    // 应该渲染 div 容器（不是 "地图加载中" placeholder）
    expect(container.querySelector('div[style*="height"]')).toBeInTheDocument()
    expect(screen.queryByText(/地图加载中/)).not.toBeInTheDocument()
  })

  it('creates draggable marker bound to onMove', () => {
    const onMove = vi.fn()
    renderWrap({ lat: 42.9, lng: 83.5, onMove })
    expect(window.AMap.Marker).toHaveBeenCalledWith(expect.objectContaining({ draggable: true }))
    // Simulate drag by calling the registered 'dragend' handler
    const dragendCall = markerOn.mock.calls.find(c => c[0] === 'dragend')
    expect(dragendCall).toBeTruthy()
    const handler = dragendCall[1]
    handler({ target: { getPosition: () => ({ getLat: () => 43.0, getLng: () => 83.6 }) } })
    expect(onMove).toHaveBeenCalledWith({ lat: 43.0, lng: 83.6 })
  })
})
