/** Opt-in real meeting + KB path for Prototype 1. Default app behavior unchanged. */
export function prototypeRealEnabled(): boolean {
  return process.env.NOTCH_PROTOTYPE === '1'
}
