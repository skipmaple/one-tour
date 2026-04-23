import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { vi, beforeEach } from 'vitest'
import LocationPicker from '../LocationPicker'

vi.mock('../LocationPickerMap', () => ({
  default: ({ lat, lng, onMove }) => (
    <div data-testid="map-stub" data-lat={lat} data-lng={lng}>
      <button onClick={() => onMove({ lat: 43, lng: 84 })}>drag-pin</button>
    </div>
  )
}))

global.fetch = vi.fn()

const renderLP = (props = {}) => render(
  <MantineProvider>
    <LocationPicker value={null} onChange={vi.fn()} {...props} />
  </MantineProvider>
)

beforeEach(() => { global.fetch.mockReset() })

describe('LocationPicker (single)', () => {
  it('shows "搜索地点" input when no value', () => {
    renderLP()
    expect(screen.getByPlaceholderText(/输入地名/)).toBeInTheDocument()
  })

  it('debounced search hits /poi_search with province-rich results', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [
        { name: '金刚镇人民政府', lat: 28.1, lng: 113.0,
          pname: '湖南省', cityname: '长沙市', adname: '浏阳市',
          address: '金刚镇平湾村', type: '政府机构' }
      ]})
    })
    renderLP()
    fireEvent.change(screen.getByPlaceholderText(/输入地名/), { target: { value: '金刚' } })
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByText('金刚镇人民政府')).toBeInTheDocument())
    expect(screen.getByText(/湖南省·长沙市·浏阳市/)).toBeInTheDocument()
  })

  it('fires onChange with full POI fields on option click', async () => {
    const onChange = vi.fn()
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [
        { name: '金刚镇', lat: 28.1, lng: 113.0,
          pname: '湖南省', cityname: '长沙市', adname: '浏阳市',
          address: '平湾村', type: '乡镇' }
      ]})
    })
    renderLP({ onChange })
    fireEvent.change(screen.getByPlaceholderText(/输入地名/), { target: { value: '金刚' } })
    await waitFor(() => expect(screen.getByText('金刚镇')).toBeInTheDocument())
    fireEvent.click(screen.getByText('金刚镇'))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      name: '金刚镇', lat: 28.1, lng: 113.0,
      pname: '湖南省', cityname: '长沙市', adname: '浏阳市'
    }))
  })

  it('after selection shows summary chip with province and [重选] button', async () => {
    const onChange = vi.fn()
    renderLP({
      value: { name: '春丽和金刚小酒馆', lat: 28.1, lng: 113.0,
               pname: '湖南省', cityname: '长沙市', adname: '岳麓区',
               address: '...', type: '餐饮' },
      onChange
    })
    expect(screen.getByText('春丽和金刚小酒馆')).toBeInTheDocument()
    expect(screen.getByText(/湖南省·长沙市·岳麓区/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /重选/ })).toBeInTheDocument()
  })

  it('dragging pin updates lat/lng via onChange', () => {
    const onChange = vi.fn()
    renderLP({
      value: { name: 'X', lat: 28.1, lng: 113.0, pname: '湖', cityname: '长', adname: '岳' },
      onChange
    })
    fireEvent.click(screen.getByText('drag-pin'))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ lat: 43, lng: 84 }))
  })

  it('region chip from regionHint is shown and closable', () => {
    renderLP({ regionHint: '浏阳市' })
    expect(screen.getByText(/城市: 浏阳市/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /关闭城市/ })).toBeInTheDocument()
  })
})

describe('LocationPicker (dual)', () => {
  it('renders two searches stacked', () => {
    render(
      <MantineProvider>
        <LocationPicker mode="dual" value={{ start: null, end: null }} onChange={vi.fn()} />
      </MantineProvider>
    )
    expect(screen.getByText('起点')).toBeInTheDocument()
    expect(screen.getByText('终点')).toBeInTheDocument()
  })

  it('onChange fires with { start, end } shape in dual mode', async () => {
    const onChange = vi.fn()
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [
        { name: '独库南入口', lat: 42.9, lng: 83.5, pname: '新疆', cityname: '阿克苏', adname: '库车' }
      ]})
    })
    render(
      <MantineProvider>
        <LocationPicker mode="dual" value={{ start: null, end: null }} onChange={onChange} />
      </MantineProvider>
    )
    const inputs = screen.getAllByPlaceholderText(/输入地名/)
    fireEvent.change(inputs[0], { target: { value: '独库' } })
    await waitFor(() => expect(screen.getByText('独库南入口')).toBeInTheDocument())
    fireEvent.click(screen.getByText('独库南入口'))
    expect(onChange).toHaveBeenCalledWith({
      start: expect.objectContaining({ name: '独库南入口' }),
      end: null,
    })
  })
})
