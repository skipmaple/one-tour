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

// jsdom lacks navigator.clipboard; Mantine useClipboard gates on its presence.
if (typeof navigator !== 'undefined' && !('clipboard' in navigator)) {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: () => Promise.resolve() },
    writable: true,
    configurable: true,
  })
}

// jsdom lacks Element.scrollIntoView; Mantine Select/Combobox calls it when
// a keyboard-selected or clicked option is outside the viewport. In CI
// Vitest treats unhandled errors as a run-level failure, so stub it here.
if (typeof window !== 'undefined' && !window.Element.prototype.scrollIntoView) {
  window.Element.prototype.scrollIntoView = function () {}
}
