let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) ctx = new AudioContext()
  return ctx
}

/** Subtle tick when a new signal arrives */
export function playIncomingChime(): void {
  const audio = getCtx()
  if (!audio) return
  void audio.resume()

  const osc = audio.createOscillator()
  const gain = audio.createGain()
  osc.connect(gain)
  gain.connect(audio.destination)
  osc.frequency.setValueAtTime(880, audio.currentTime)
  osc.frequency.exponentialRampToValueAtTime(660, audio.currentTime + 0.08)
  gain.gain.setValueAtTime(0.0001, audio.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.06, audio.currentTime + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.15)
  osc.start(audio.currentTime)
  osc.stop(audio.currentTime + 0.16)
}
