import { EventEmitter } from 'events'
import { spawn, type ChildProcess } from 'child_process'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

export type TranscriptChunk = {
  text: string
  timestamp: number
}

/** whisper.cpp stream clears lines with ANSI sequences — strip before storing. */
export function stripWhisperControl(text: string): string {
  return text
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
    .replace(/\x1b\].*?\x07/g, '')
    .replace(/\r/g, '')
    .trim()
}

function parseWhisperLine(raw: string): string | null {
  let text = stripWhisperControl(raw)
  text = text.replace(/^\[\d{2}:\d{2}:\d{2}\.\d{3}\s*(?:-->\s*\[\d{2}:\d{2}:\d{2}\.\d{3}\])?\]\s*/, '')
  if (!text || /^[\[\]2K\s]+$/.test(text)) return null
  if (/^(whisper_|ggml_|main:|init |SDL|load |processing|ffmpeg|usage:)/i.test(text)) return null
  return text
}

export type AudioTapStatus = {
  running: boolean
  whisperReady: boolean
  whisperPath: string
  modelPath: string
  whisperDir: string
  lastChunkAt?: number
  error?: string
}

type AudioTapEvents = {
  chunk: (chunk: TranscriptChunk) => void
  error: (message: string) => void
  started: () => void
  stopped: () => void
}

/** Dev Electron userData ≠ setup script install dir — check both. */
export function resolveWhisperRoot(userData: string): string {
  const candidates = [
    process.env.STREAM_WHISPER_DIR,
    join(homedir(), 'Library/Application Support/stream-app/whisper'),
    join(userData, 'whisper')
  ].filter(Boolean) as string[]

  for (const dir of candidates) {
    const bin = join(dir, 'stream')
    const model = join(dir, 'models', 'ggml-medium.en.bin')
    if (existsSync(bin) && existsSync(model)) return dir
  }
  return join(userData, 'whisper')
}

export class AudioTap extends EventEmitter {
  private proc: ChildProcess | null = null
  private stdoutBuffer = ''
  private stderrBuffer = ''
  private lastPartial = ''
  private lastError: string | undefined
  private lastChunkAt: number | undefined
  private readonly root: string

  constructor(userData: string) {
    super()
    this.root = resolveWhisperRoot(userData)
  }

  static paths(userData: string): { bin: string; model: string; dir: string } {
    const dir = resolveWhisperRoot(userData)
    return {
      dir,
      bin: join(dir, 'stream'),
      model: join(dir, 'models', 'ggml-medium.en.bin')
    }
  }

  status(): AudioTapStatus {
    const bin = join(this.root, 'stream')
    const model = join(this.root, 'models', 'ggml-medium.en.bin')
    const whisperReady = existsSync(bin) && existsSync(model)
    return {
      running: this.proc !== null,
      whisperReady,
      whisperPath: bin,
      modelPath: model,
      whisperDir: this.root,
      lastChunkAt: this.lastChunkAt,
      error: this.lastError
    }
  }

  start(): AudioTapStatus {
    if (this.proc) return this.status()

    const bin = join(this.root, 'stream')
    const model = join(this.root, 'models', 'ggml-medium.en.bin')
    const dir = this.root
    if (!existsSync(bin)) {
      const msg = `whisper binary not found at ${bin}. Use tray → Setup meeting transcription.`
      this.lastError = msg
      this.emit('error', msg)
      return this.status()
    }
    if (!existsSync(model)) {
      const msg = `whisper model not found at ${model}. Run setup-whisper.sh.`
      this.lastError = msg
      this.emit('error', msg)
      return this.status()
    }

    this.lastError = undefined
    this.stdoutBuffer = ''
    this.stderrBuffer = ''
    this.lastPartial = ''

    this.proc = spawn(
      bin,
      ['-m', model, '-t', '4', '--step', '3000', '--length', '10000', '-l', 'en'],
      { stdio: ['ignore', 'pipe', 'pipe'], cwd: dir }
    )
    const proc = this.proc

    const onStreamData = (which: 'stdout' | 'stderr', data: Buffer) => {
      if (which === 'stdout') {
        this.stdoutBuffer += data.toString()
        const lines = this.stdoutBuffer.split(/\r?\n/)
        this.stdoutBuffer = lines.pop() ?? ''
        for (const line of lines) this.maybeEmitTranscript(line)
      } else {
        this.stderrBuffer += data.toString()
        const lines = this.stderrBuffer.split(/\r?\n/)
        this.stderrBuffer = lines.pop() ?? ''
        for (const line of lines) {
          const parsed = parseWhisperLine(line)
          if (parsed) this.maybeEmitTranscript(parsed)
          else if (/error|fail/i.test(line)) {
            this.lastError = stripWhisperControl(line)
            this.emit('error', this.lastError)
          }
        }
      }
    }

    proc.stdout?.on('data', (data: Buffer) => onStreamData('stdout', data))
    proc.stderr?.on('data', (data: Buffer) => onStreamData('stderr', data))

    proc.on('exit', (code: number | null) => {
      this.proc = null
      if (code && code !== 0 && !this.lastError) {
        this.lastError = `whisper exited with code ${code}`
        this.emit('error', this.lastError)
      }
      this.emit('stopped')
    })

    this.emit('started')
    return this.status()
  }

  /** whisper stream rewrites the same partial line — emit deltas, not every refresh. */
  private maybeEmitTranscript(raw: string): void {
    const text = parseWhisperLine(raw)
    if (!text) return
    if (text === this.lastPartial) return

    let delta = text
    if (text.startsWith(this.lastPartial)) {
      delta = text.slice(this.lastPartial.length).trim()
    } else if (this.lastPartial.startsWith(text)) {
      return
    }
    this.lastPartial = text

    if (delta.length < 2) return
    this.lastChunkAt = Date.now()
    this.emit('chunk', { text: delta, timestamp: this.lastChunkAt })
  }

  stop(): AudioTapStatus {
    if (this.proc) {
      this.proc.kill('SIGTERM')
      this.proc = null
    }
    this.emit('stopped')
    return this.status()
  }

  override on<E extends keyof AudioTapEvents>(event: E, listener: AudioTapEvents[E]): this {
    return super.on(event, listener)
  }

  override emit<E extends keyof AudioTapEvents>(
    event: E,
    ...args: Parameters<AudioTapEvents[E]>
  ): boolean {
    return super.emit(event, ...args)
  }
}
