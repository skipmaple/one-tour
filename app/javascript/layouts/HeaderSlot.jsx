import { createContext, useContext, useEffect, useState } from 'react'

const HeaderSlotContext = createContext({ right: null, setRight: () => {} })

export function HeaderSlotProvider({ children }) {
  const [right, setRight] = useState(null)
  return (
    <HeaderSlotContext.Provider value={{ right, setRight }}>
      {children}
    </HeaderSlotContext.Provider>
  )
}

export function useHeaderRightSlot() {
  return useContext(HeaderSlotContext).right
}

export function useInjectHeaderRight(node) {
  const { setRight } = useContext(HeaderSlotContext)
  useEffect(() => {
    setRight(node)
    return () => setRight(null)
  }, [node, setRight])
}
