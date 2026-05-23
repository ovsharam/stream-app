export {}

declare global {
  interface Window {
    notch?: {
      collapse: () => void
      expand: () => void
      onMode?: (cb: (mode: 'idle' | 'expanded') => void) => () => void
    }
  }
}
