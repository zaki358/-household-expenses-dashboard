import '@testing-library/jest-dom/vitest'

// jsdom does not implement ResizeObserver, which Recharts'
// ResponsiveContainer requires to measure its parent element.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver
}
