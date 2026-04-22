import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { HeaderSlotProvider, useInjectHeaderRight, useHeaderRightSlot, useInjectHeaderLeftTools, useHeaderLeftToolsSlot } from '../HeaderSlot.jsx'

function Consumer() {
  const node = useHeaderRightSlot()
  return <div data-testid="slot-consumer">{node}</div>
}

function Injector({ node }) {
  useInjectHeaderRight(node)
  return null
}

function LeftConsumer() {
  const node = useHeaderLeftToolsSlot()
  return <div data-testid="left-slot-consumer">{node}</div>
}

function LeftInjector({ node }) {
  useInjectHeaderLeftTools(node)
  return null
}

describe('HeaderSlot', () => {
  it('starts with no right-slot content', () => {
    render(
      <HeaderSlotProvider>
        <Consumer />
      </HeaderSlotProvider>,
    )
    expect(screen.getByTestId('slot-consumer')).toBeEmptyDOMElement()
  })

  it('shows the injected content', () => {
    render(
      <HeaderSlotProvider>
        <Consumer />
        <Injector node={<span data-testid="injected">hi</span>} />
      </HeaderSlotProvider>,
    )
    expect(screen.getByTestId('injected')).toBeInTheDocument()
  })

  it('clears the slot when the injector unmounts', () => {
    function Wrapper({ show }) {
      return (
        <HeaderSlotProvider>
          <Consumer />
          {show && <Injector node={<span data-testid="injected">hi</span>} />}
        </HeaderSlotProvider>
      )
    }
    const { rerender } = render(<Wrapper show />)
    expect(screen.getByTestId('injected')).toBeInTheDocument()
    rerender(<Wrapper show={false} />)
    expect(screen.queryByTestId('injected')).not.toBeInTheDocument()
  })
})

describe('HeaderSlot · left tools', () => {
  it('starts with no left-slot content', () => {
    render(
      <HeaderSlotProvider>
        <LeftConsumer />
      </HeaderSlotProvider>,
    )
    expect(screen.getByTestId('left-slot-consumer')).toBeEmptyDOMElement()
  })

  it('shows injected left content', () => {
    render(
      <HeaderSlotProvider>
        <LeftConsumer />
        <LeftInjector node={<span data-testid="left-injected">tools</span>} />
      </HeaderSlotProvider>,
    )
    expect(screen.getByTestId('left-injected')).toBeInTheDocument()
  })

  it('clears left slot on unmount', () => {
    function Wrapper({ show }) {
      return (
        <HeaderSlotProvider>
          <LeftConsumer />
          {show && <LeftInjector node={<span data-testid="left-injected">tools</span>} />}
        </HeaderSlotProvider>
      )
    }
    const { rerender } = render(<Wrapper show />)
    expect(screen.getByTestId('left-injected')).toBeInTheDocument()
    rerender(<Wrapper show={false} />)
    expect(screen.queryByTestId('left-injected')).not.toBeInTheDocument()
  })

  it('left and right slots are independent', () => {
    render(
      <HeaderSlotProvider>
        <LeftConsumer />
        <Consumer />
        <LeftInjector node={<span data-testid="left-injected">L</span>} />
        <Injector node={<span data-testid="injected">R</span>} />
      </HeaderSlotProvider>,
    )
    expect(screen.getByTestId('left-injected')).toBeInTheDocument()
    expect(screen.getByTestId('injected')).toBeInTheDocument()
  })
})
