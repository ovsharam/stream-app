import { execSync } from 'child_process'
import { createDecipheriv, pbkdf2Sync } from 'crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type { Session } from 'electron'
import { session as electronSession } from 'electron'

/** Shared session for general in-app browsing (all tabs share cookies). */
export const NOTCH_BROWSER_PARTITION = 'persist:notch-browser'
export const GOOGLE_BROWSER_PARTITION = 'persist:google-browse'
export const LINKEDIN_BROWSER_PARTITION = 'persist:linkedin-browse'

type ChromeCookieRow = {
  host_key: string
  name: string
  value: string
  encrypted_value: Buffer | null
  path: string
  expires_utc: number
  is_secure: number
  is_httponly: number
  samesite: number
}

export type ChromeImportResult = {
  ok: boolean
  imported: number
  skipped: number
  profile?: string
  error?: string
}

const GOOGLE_HOST_SUFFIXES = [
  'google.com',
  'youtube.com',
  'gmail.com',
  'googleapis.com',
  'gstatic.com',
  'googleusercontent.com'
]

function resolveChromeProfileDir(): string | null {
  const base = join(homedir(), 'Library', 'Application Support', 'Google', 'Chrome')
  const localStatePath = join(base, 'Local State')
  if (!existsSync(localStatePath)) {
    const fallback = join(base, 'Default')
    return existsSync(join(fallback, 'Cookies')) ? fallback : null
  }
  try {
    const localState = JSON.parse(readFileSync(localStatePath, 'utf8')) as {
      profile?: { last_used?: string; info_cache?: Record<string, unknown> }
    }
    const lastUsed = localState.profile?.last_used ?? 'Default'
    const dir = join(base, lastUsed)
    if (existsSync(join(dir, 'Cookies'))) return dir
  } catch {
    /* fall through */
  }
  const fallback = join(base, 'Default')
  return existsSync(join(fallback, 'Cookies')) ? fallback : null
}

function chromeSafeStorageKey(): Buffer | null {
  if (process.platform !== 'darwin') return null
  try {
    const password = execSync('security find-generic-password -w -s "Chrome Safe Storage" -a "Chrome"', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }).trim()
    if (!password) return null
    return pbkdf2Sync(password, 'saltysalt', 1003, 16, 'sha1')
  } catch {
    return null
  }
}

function decryptChromeCookie(encrypted: Buffer, key: Buffer): string | null {
  if (encrypted.length === 0) return null
  const prefix = encrypted.subarray(0, 3).toString()
  if (prefix !== 'v10' && prefix !== 'v11') {
    return encrypted.toString('utf8')
  }
  try {
    const iv = Buffer.alloc(16, 0x20)
    const ciphertext = encrypted.subarray(3)
    const decipher = createDecipheriv('aes-128-cbc', key, iv)
    decipher.setAutoPadding(false)
    let decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
    const pad = decrypted[decrypted.length - 1]
    if (pad >= 1 && pad <= 16) {
      decrypted = decrypted.subarray(0, decrypted.length - pad)
    }
    return decrypted.toString('utf8')
  } catch {
    return null
  }
}

function cookieUrl(host: string, secure: boolean, path: string): string {
  const hostname = host.startsWith('.') ? host.slice(1) : host
  const p = path?.startsWith('/') ? path : `/${path ?? ''}`
  return `${secure ? 'https' : 'http'}://${hostname}${p}`
}

function sameSiteValue(n: number): 'unspecified' | 'no_restriction' | 'lax' | 'strict' {
  if (n === 1) return 'lax'
  if (n === 2) return 'strict'
  if (n === 3) return 'no_restriction'
  return 'unspecified'
}

function chromeExpiryToUnix(expiresUtc: number): number | undefined {
  if (!expiresUtc) return undefined
  const unix = Math.floor(expiresUtc / 1_000_000 - 11_644_473_600)
  return unix > 0 ? unix : undefined
}

function partitionForHost(host: string): string {
  const h = host.toLowerCase().replace(/^\./, '')
  if (GOOGLE_HOST_SUFFIXES.some((s) => h === s || h.endsWith(`.${s}`))) {
    return GOOGLE_BROWSER_PARTITION
  }
  if (h === 'linkedin.com' || h.endsWith('.linkedin.com')) {
    return LINKEDIN_BROWSER_PARTITION
  }
  return NOTCH_BROWSER_PARTITION
}

function loadBetterSqlite(): (new (path: string, opts?: { readonly?: boolean }) => {
  prepare: (sql: string) => { all: () => ChromeCookieRow[] }
  close: () => void
}) | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('better-sqlite3') as ReturnType<typeof loadBetterSqlite>
  } catch {
    return null
  }
}

function readChromeCookies(profileDir: string, key: Buffer | null): Array<ChromeCookieRow & { decrypted: string }> {
  const Sqlite = loadBetterSqlite()
  if (!Sqlite) {
    throw new Error(
      'better-sqlite3 is not built for this Electron runtime — run: npx @electron/rebuild -f -w better-sqlite3'
    )
  }

  const src = join(profileDir, 'Cookies')
  const tmpDir = join(profileDir, '.notch-import')
  mkdirSync(tmpDir, { recursive: true })
  const tmp = join(tmpDir, `Cookies-${Date.now()}.db`)
  copyFileSync(src, tmp)

  const db = new Sqlite(tmp, { readonly: true })
  try {
    const rows = db
      .prepare(
        `SELECT host_key, name, value, encrypted_value, path, expires_utc, is_secure, is_httponly, samesite
         FROM cookies`
      )
      .all() as ChromeCookieRow[]

    const out: Array<ChromeCookieRow & { decrypted: string }> = []
    for (const row of rows) {
      let decrypted = row.value?.trim() ?? ''
      if (!decrypted && row.encrypted_value && key) {
        decrypted = decryptChromeCookie(row.encrypted_value, key) ?? ''
      }
      if (!decrypted || !row.name) continue
      out.push({ ...row, decrypted })
    }
    return out
  } finally {
    db.close()
  }
}

async function setCookieOnPartition(
  part: string,
  row: ChromeCookieRow & { decrypted: string }
): Promise<boolean> {
  const sess = electronSession.fromPartition(part)
  const url = cookieUrl(row.host_key, Boolean(row.is_secure), row.path)
  try {
    await sess.cookies.set({
      url,
      name: row.name,
      value: row.decrypted,
      path: row.path || '/',
      secure: Boolean(row.is_secure),
      httpOnly: Boolean(row.is_httponly),
      sameSite: sameSiteValue(row.samesite),
      expirationDate: chromeExpiryToUnix(row.expires_utc)
    })
    return true
  } catch {
    return false
  }
}

export async function importChromeCookiesToNotch(opts?: { quiet?: boolean }): Promise<ChromeImportResult> {
  if (process.platform !== 'darwin') {
    return {
      ok: false,
      imported: 0,
      skipped: 0,
      error: 'Chrome cookie import is supported on macOS only.'
    }
  }

  const profileDir = resolveChromeProfileDir()
  if (!profileDir) {
    return {
      ok: false,
      imported: 0,
      skipped: 0,
      error: 'Chrome profile not found. Install Chrome and sign in at least once.'
    }
  }

  const key = chromeSafeStorageKey()
  if (!key) {
    return {
      ok: false,
      imported: 0,
      skipped: 0,
      profile: profileDir,
      error: 'Could not read Chrome Safe Storage from Keychain. Allow Notch in System Settings → Privacy.'
    }
  }

  let rows: Array<ChromeCookieRow & { decrypted: string }>
  try {
    rows = readChromeCookies(profileDir, key)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      imported: 0,
      skipped: 0,
      profile: profileDir,
      error: message.includes('database is locked')
        ? 'Quit Chrome and try again (Chrome locks its cookie database while running).'
        : message
    }
  }

  let imported = 0
  let skipped = 0
  const byPartition = new Map<string, Array<ChromeCookieRow & { decrypted: string }>>()

  for (const row of rows) {
    const part = partitionForHost(row.host_key)
    const list = byPartition.get(part) ?? []
    list.push(row)
    byPartition.set(part, list)
  }

  for (const [part, cookies] of byPartition) {
    configureImportedSession(electronSession.fromPartition(part))
    for (const row of cookies) {
      const ok = await setCookieOnPartition(part, row)
      if (ok) imported += 1
      else skipped += 1
    }
  }

  if (!opts?.quiet) {
    console.log(
      `[notch] imported ${imported} Chrome cookies (${skipped} skipped) from ${profileDir}`
    )
  }

  return { ok: true, imported, skipped, profile: profileDir }
}

/** Match embedded session hardening used in main.ts. */
export function configureImportedSession(sess: Session): void {
  sess.setUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.6778.204 Safari/537.36'
  )
}
