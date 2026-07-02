import type { ConnectorImpl, ConnectorChunk } from './types'

// Public documentation crawler — no auth.
// BFS-crawls public docs sites (docs.acme.com) from seed URLs, staying on the
// same host, and yields one chunk per page. Covers the "public documentation"
// leg that Confluence/GitBook/Notion/Readme (internal docs) don't reach —
// e.g. a competitor integration's public docs, or your own docs site when
// there's no API access to the docs platform.

const DEFAULT_MAX_PAGES = 40
const FETCH_TIMEOUT_MS = 20_000
const UA = 'Mozilla/5.0 (compatible; PlumbBot/1.0; +https://useplumb.ai)'

const SKIP_EXTENSIONS = /\.(png|jpe?g|gif|svg|ico|css|js|json|xml|pdf|zip|woff2?|ttf|mp4|webm)(\?|$)/i
const SKIP_PATH_HINTS = /\/(login|signup|signin|pricing|careers|legal|privacy|terms|blog\/tag|search)\b/i

function stripHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, ' ')
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, ' ')
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, ' ')
    .replace(/<\/?(p|div|h[1-6]|li|tr|br|article|section|blockquote|pre|td)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '—').replace(/&ndash;/g, '–')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function pageTitle(html: string): string {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  return m ? m[1].replace(/\s+/g, ' ').trim() : ''
}

/** Extract same-host, crawlable links from a page. */
function extractLinks(html: string, baseUrl: URL): string[] {
  const links = new Set<string>()
  const re = /<a\b[^>]*href\s*=\s*["']([^"'#]+)["']/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    try {
      const url = new URL(m[1], baseUrl)
      if (url.hostname !== baseUrl.hostname) continue
      if (SKIP_EXTENSIONS.test(url.pathname)) continue
      if (SKIP_PATH_HINTS.test(url.pathname)) continue
      url.hash = ''
      url.search = ''
      links.add(url.toString())
    } catch { /* malformed href */ }
  }
  return [...links]
}

async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'text/html' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    redirect: 'follow',
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const type = res.headers.get('Content-Type') ?? ''
  if (!type.includes('text/html')) throw new Error(`not HTML (${type})`)
  return res.text()
}

export const docsSiteConnector: ConnectorImpl = {
  type: 'docs_site',
  label: 'Public docs site',
  description: 'Crawls public documentation sites (no login) and ingests every page.',
  authType: 'none',

  async validate(_creds, settings) {
    const seeds = settings.siteUrls ?? []
    if (seeds.length === 0) {
      return { ok: false, error: 'Add at least one docs site URL in settings.siteUrls' }
    }
    try {
      await fetchPage(seeds[0])
      return { ok: true }
    } catch (e) {
      return { ok: false, error: `${seeds[0]}: ${(e as Error).message}` }
    }
  },

  async *fetchChunks(_creds, settings) {
    const seeds = (settings.siteUrls ?? []).map(u => u.trim()).filter(Boolean)
    const maxPages = Math.min(settings.maxPages ?? DEFAULT_MAX_PAGES, 200)

    for (const seed of seeds) {
      let seedUrl: URL
      try {
        seedUrl = new URL(seed)
      } catch {
        console.warn(`[docs-site] invalid seed URL: ${seed}`)
        continue
      }

      const queue: string[] = [seedUrl.toString()]
      const visited = new Set<string>()

      while (queue.length > 0 && visited.size < maxPages) {
        const url = queue.shift()!
        if (visited.has(url)) continue
        visited.add(url)

        let html: string
        try {
          html = await fetchPage(url)
        } catch (e) {
          console.warn(`[docs-site] fetch failed ${url}:`, (e as Error).message)
          continue
        }

        // Enqueue discovered links (BFS, same host)
        for (const link of extractLinks(html, seedUrl)) {
          if (!visited.has(link) && queue.length + visited.size < maxPages * 3) {
            queue.push(link)
          }
        }

        const text = stripHtml(html)
        if (text.length < 200) continue  // nav shells, redirects

        const title = pageTitle(html) || new URL(url).pathname
        yield {
          content: `Doc page: ${title}\nURL: ${url}\n\n${text.slice(0, 20000)}`,
          sourceId: `docs-${url}`,
          sourceUrl: url,
          title,
          contentType: 'doc',
        } satisfies ConnectorChunk

        // Be polite to the docs host
        await new Promise(r => setTimeout(r, 300))
      }

      console.log(`[docs-site] crawled ${visited.size} page(s) from ${seed}`)
    }
  },
}
