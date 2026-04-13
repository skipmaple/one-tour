import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { MantineProvider } from '@mantine/core'
import StatusBar from './StatusBar'

const wrap = (ui) => render(<MantineProvider>{ui}</MantineProvider>)

describe('StatusBar', () => {
  it('displays word count', () => {
    wrap(<StatusBar content="hello world foo" lastSaved={null} saving={false} error={null} />)
    expect(screen.getByText('3 字')).toBeInTheDocument()
  })

  it('shows 0 words for empty content', () => {
    wrap(<StatusBar content="" lastSaved={null} saving={false} error={null} />)
    expect(screen.getByText('0 字')).toBeInTheDocument()
  })

  it('shows saving state', () => {
    wrap(<StatusBar content="test" lastSaved={null} saving={true} error={null} />)
    expect(screen.getByText('保存中...')).toBeInTheDocument()
  })

  it('shows error state', () => {
    wrap(<StatusBar content="test" lastSaved={null} saving={false} error="保存失败" />)
    expect(screen.getByText('保存失败')).toBeInTheDocument()
  })

  it('shows last saved time', () => {
    wrap(<StatusBar content="test" lastSaved="10:30:00" saving={false} error={null} />)
    expect(screen.getByText('已保存 10:30:00')).toBeInTheDocument()
  })

  it('does not show saved time while saving', () => {
    wrap(<StatusBar content="test" lastSaved="10:30:00" saving={true} error={null} />)
    expect(screen.queryByText('已保存 10:30:00')).not.toBeInTheDocument()
    expect(screen.getByText('保存中...')).toBeInTheDocument()
  })
})
