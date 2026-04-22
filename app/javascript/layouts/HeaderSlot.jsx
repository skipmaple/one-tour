import { createContext, useContext, useEffect, useState } from 'react'

const HeaderSlotContext = createContext({
  right: null, setRight: () => {},
  leftTools: null, setLeftTools: () => {},
})

export function HeaderSlotProvider({ children }) {
  const [right, setRight] = useState(null)
  const [leftTools, setLeftTools] = useState(null)
  return (
    <HeaderSlotContext.Provider value={{ right, setRight, leftTools, setLeftTools }}>
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

export function useHeaderLeftToolsSlot() {
  return useContext(HeaderSlotContext).leftTools
}

export function useInjectHeaderLeftTools(node) {
  const { setLeftTools } = useContext(HeaderSlotContext)
  useEffect(() => {
    setLeftTools(node)
    return () => setLeftTools(null)
  }, [node, setLeftTools])
}
