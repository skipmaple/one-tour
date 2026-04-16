import '@testing-library/jest-dom'

// jsdom lacks window.matchMedia; Mantine's color-scheme provider calls it.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() { return true },
  }),
})

// jsdom lacks ResizeObserver; Mantine Textarea autosize needs it.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

// jsdom lacks document.fonts (FontFaceSet); Mantine Textarea autosize calls
// document.fonts.addEventListener('loadingdone', ...).
if (typeof document !== 'undefined' && !document.fonts) {
  document.fonts = {
    addEventListener() {},
    removeEventListener() {},
  }
}
