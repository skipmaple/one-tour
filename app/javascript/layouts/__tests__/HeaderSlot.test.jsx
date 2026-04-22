import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { HeaderSlotProvider, useInjectHeaderRight, useHeaderRightSlot } from '../HeaderSlot.jsx'

function Consumer() {
  const node = useHeaderRightSlot()
  return <div data-testid="slot-consumer">{node}</div>
}

function Injector({ node }) {
  useInjectHeaderRight(node)
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
