import { render, screen, fireEvent } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { vi, beforeEach, describe, test, expect } from 'vitest'
import ChatPanel from '../ChatPanel'

// Drive ChatPanel through a controllable stand-in for useChat so we can assert
// wiring (send is called, messages + tool calls render, streaming disables input,
// error state surfaces) without touching ActionCable or fetch.
const mockState = {
  messages: [],
  streaming: false,
  pendingToolCalls: {},
  error: null,
  send: vi.fn()
}
vi.mock('../../../hooks/useChat', () => ({
  default: () => mockState
}))

function renderPanel(props = {}) {
  const tour = { id: 42, title: 'Test Tour' }
  return render(
    <MantineProvider>
      <ChatPanel tour={tour} open={true} onToggle={() => {}} {...props} />
    </MantineProvider>
  )
}

beforeEach(() => {
  mockState.messages = []
  mockState.streaming = false
  mockState.pendingToolCalls = {}
  mockState.error = null
  mockState.send.mockReset()
})

describe('ChatPanel', () => {
  test('renders empty state when no messages', () => {
    renderPanel()
    expect(screen.getByText(/还没有对话/)).toBeInTheDocument()
  })

  test('renders user and assistant messages', () => {
    mockState.messages = [
      { role: 'user', content: '加个赛里木湖' },
      { role: 'assistant', content: '已加入 D1' }
    ]
    renderPanel()
    expect(screen.getByText('加个赛里木湖')).toBeInTheDocument()
    expect(screen.getByText('已加入 D1')).toBeInTheDocument()
  })

  test('renders a pending tool call as a running badge, then done when result arrives', () => {
    mockState.pendingToolCalls = {
      tc1: { name: 'search_poi', arguments: { query: '赛里木湖' } }
    }
    const { rerender } = renderPanel()
    expect(screen.getByText('执行中')).toBeInTheDocument()
    expect(screen.getByText(/search_poi/)).toBeInTheDocument()

    mockState.pendingToolCalls = {
      tc1: { name: 'search_poi', arguments: { query: '赛里木湖' }, result: { ok: true } }
    }
    rerender(
      <MantineProvider>
        <ChatPanel tour={{ id: 42, title: 't' }} open={true} onToggle={() => {}} />
      </MantineProvider>
    )
    expect(screen.getByText('完成')).toBeInTheDocument()
  })

  test('marks a failed tool call (result.ok === false) as 失败', () => {
    mockState.pendingToolCalls = {
      tc1: { name: 'add_activity', arguments: {}, result: { ok: false, error: { code: 'x' } } }
    }
    renderPanel()
    expect(screen.getByText('失败')).toBeInTheDocument()
  })

  test('send button calls useChat.send with trimmed content and clears input', () => {
    renderPanel()
    const textarea = screen.getByPlaceholderText(/说点什么/)
    fireEvent.change(textarea, { target: { value: '  加个赛里木湖  ' } })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))
    expect(mockState.send).toHaveBeenCalledWith('加个赛里木湖')
    expect(textarea.value).toBe('')
  })

  test('send button is disabled while streaming, and label changes to 处理中…', () => {
    mockState.streaming = true
    renderPanel()
    const btn = screen.getByRole('button', { name: /处理中/ })
    expect(btn).toBeDisabled()
  })

  test('surfaces error state as a visible message', () => {
    mockState.error = 'LLM connection failed'
    renderPanel()
    expect(screen.getByTestId('chat-error')).toHaveTextContent(/LLM connection failed/)
  })

  test('collapsed view shows 展开 prompt and no input', () => {
    render(
      <MantineProvider>
        <ChatPanel tour={{ id: 1, title: 't' }} open={false} onToggle={() => {}} />
      </MantineProvider>
    )
    expect(screen.getByRole('button', { name: '展开 AI 对话' })).toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/说点什么/)).not.toBeInTheDocument()
  })

  test('auto-sends pendingPrompt and calls onPromptConsumed', () => {
    const onPromptConsumed = vi.fn()
    renderPanel({ pendingPrompt: '请分析 D3 驾驶超时', onPromptConsumed })
    expect(mockState.send).toHaveBeenCalledWith('请分析 D3 驾驶超时')
    expect(onPromptConsumed).toHaveBeenCalled()
  })

  test('does not render a user message whose content is the onboarding sentinel', () => {
    mockState.messages = [
      { role: 'user', content: '__onboarding_start__' },
      { role: 'assistant', content: '欢迎 👋 这次想去哪？' }
    ]
    renderPanel()
    expect(screen.queryByText('__onboarding_start__')).not.toBeInTheDocument()
    expect(screen.getByText(/欢迎/)).toBeInTheDocument()
  })

  test('does render a user message with normal content (not sentinel)', () => {
    mockState.messages = [
      { role: 'user', content: '伊犁环线' }
    ]
    renderPanel()
    expect(screen.getByText('伊犁环线')).toBeInTheDocument()
  })
})

test('folded state exposes role=button with accessible name 展开 AI 对话', () => {
  const onToggle = vi.fn()
  const tour = { id: 42, title: 'Test Tour' }
  render(
    <MantineProvider>
      <ChatPanel tour={tour} open={false} onToggle={onToggle} />
    </MantineProvider>
  )
  const btn = screen.getByRole('button', { name: '展开 AI 对话' })
  expect(btn).toBeInTheDocument()
  fireEvent.click(btn)
  expect(onToggle).toHaveBeenCalledTimes(1)
})
