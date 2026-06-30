import { Router } from 'express'
import type { Request, Response } from 'express'
import { decodeContent, chunkDocument } from './chunker'
import { extractDocument } from './extractor'
import {
  createIngestJob,
  updateJobStatus,
  getJob,
  listJobs,
  insertReviewItems,
  listReviewItems,
  updateReviewItem,
  getProductGraphStats
} from './ingestStore'
import { writeApprovedNodes } from './graphWriter'
import { queryProductGraph, formatProductContextForPrompt } from './queryService'

export function productGraphRouter(): Router {
  const router = Router()

  // POST /product-graph/ingest
  // Body: { customerId, fileName, mimeType, content: base64 }
  router.post('/ingest', async (req: Request, res: Response) => {
    try {
      const { customerId, fileName, mimeType, content } = req.body as {
        customerId: string
        fileName: string
        mimeType: string
        content: string
      }

      if (!customerId || !fileName || !content) {
        res.status(400).json({ error: 'customerId, fileName, content required' })
        return
      }

      const job = createIngestJob({ customerId, fileName, mimeType: mimeType ?? 'text/plain' })

      // Run pipeline async — return job immediately
      setImmediate(() => runIngestPipeline(job.id, customerId, content, mimeType ?? 'text/plain'))

      res.json({ jobId: job.id, status: 'pending' })
    } catch (err) {
      res.status(500).json({ error: (err as Error).message })
    }
  })

  // GET /product-graph/jobs?customerId=...
  router.get('/jobs', (req: Request, res: Response) => {
    const customerId = String(req.query.customerId ?? '')
    if (!customerId) { res.status(400).json({ error: 'customerId required' }); return }
    res.json(listJobs(customerId))
  })

  // GET /product-graph/jobs/:jobId
  router.get('/jobs/:jobId', (req: Request, res: Response) => {
    const job = getJob(String(req.params.jobId))
    if (!job) { res.status(404).json({ error: 'job not found' }); return }
    res.json(job)
  })

  // GET /product-graph/review?customerId=...&status=pending|approved|rejected
  router.get('/review', (req: Request, res: Response) => {
    const customerId = String(req.query.customerId ?? '')
    if (!customerId) { res.status(400).json({ error: 'customerId required' }); return }
    const status = req.query.status as 'pending' | 'approved' | 'rejected' | undefined
    res.json(listReviewItems(customerId, status))
  })

  // POST /product-graph/review/:nodeId/approve
  router.post('/review/:nodeId/approve', (req: Request, res: Response) => {
    const { editedName, editedDescription } = req.body as { editedName?: string; editedDescription?: string }
    const updated = updateReviewItem(String(req.params.nodeId), {
      status: 'approved',
      editedName,
      editedDescription
    })
    if (!updated) { res.status(404).json({ error: 'item not found' }); return }
    res.json(updated)
  })

  // POST /product-graph/review/:nodeId/reject
  router.post('/review/:nodeId/reject', (req: Request, res: Response) => {
    const updated = updateReviewItem(String(req.params.nodeId), { status: 'rejected' })
    if (!updated) { res.status(404).json({ error: 'item not found' }); return }
    res.json(updated)
  })

  // POST /product-graph/write
  // Body: { jobId, customerId } — writes approved nodes to FalkorDB
  router.post('/write', async (req: Request, res: Response) => {
    try {
      const { jobId, customerId } = req.body as { jobId: string; customerId: string }
      if (!jobId || !customerId) { res.status(400).json({ error: 'jobId, customerId required' }); return }
      const result = await writeApprovedNodes(jobId, customerId)
      res.json(result)
    } catch (err) {
      res.status(500).json({ error: (err as Error).message })
    }
  })

  // POST /product-graph/query
  // Body: { customerId, dealDescription }
  router.post('/query', async (req: Request, res: Response) => {
    try {
      const { customerId, dealDescription, format, minScore } = req.body as {
        customerId: string
        dealDescription: string
        format?: 'json' | 'prompt'
        minScore?: number
      }
      if (!customerId || !dealDescription) {
        res.status(400).json({ error: 'customerId, dealDescription required' }); return
      }
      const result = await queryProductGraph(customerId, dealDescription, minScore ?? 1)
      if (format === 'prompt') {
        res.json({ context: formatProductContextForPrompt(result, customerId) })
      } else {
        res.json(result)
      }
    } catch (err) {
      res.status(500).json({ error: (err as Error).message })
    }
  })

  // POST /product-graph/ingest-urls
  // Body: { customerId, urls: string[] } — up to 20 URLs, scraped in background
  router.post('/ingest-urls', async (req: Request, res: Response) => {
    try {
      const { customerId, urls } = req.body as { customerId: string; urls: string[] }
      if (!customerId || !Array.isArray(urls) || urls.length === 0) {
        res.status(400).json({ error: 'customerId and urls[] required' })
        return
      }
      const capped = urls.map(u => u.trim()).filter(Boolean).slice(0, 20)
      const jobs = capped.map(url => {
        let fileName: string
        try { fileName = new URL(url).hostname + new URL(url).pathname.replace(/\/$/, '') + '.txt' }
        catch { fileName = url.slice(0, 80) + '.txt' }
        const job = createIngestJob({ customerId, fileName, mimeType: 'text/plain' })
        setImmediate(() => runUrlIngestPipeline(job.id, customerId, url))
        return { url, jobId: job.id, status: 'pending' }
      })
      res.json({ jobs })
    } catch (err) {
      res.status(500).json({ error: (err as Error).message })
    }
  })

  // GET /product-graph/stats?customerId=...
  router.get('/stats', (req: Request, res: Response) => {
    const customerId = String(req.query.customerId ?? '')
    if (!customerId) { res.status(400).json({ error: 'customerId required' }); return }
    res.json(getProductGraphStats(customerId))
  })

  return router
}

function stripHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, ' ')
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, ' ')
    .replace(/<\/?(p|div|h[1-6]|li|tr|br|article|section|blockquote)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '—').replace(/&ndash;/g, '–')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

async function runUrlIngestPipeline(jobId: string, customerId: string, url: string): Promise<void> {
  try {
    updateJobStatus(jobId, 'chunking')
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PlumbBot/1.0; +https://useplumb.ai)' },
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`)
    const html = await res.text()
    const text = stripHtml(html)
    if (!text.trim()) throw new Error('No text content found at URL')
    const b64 = Buffer.from(text, 'utf-8').toString('base64')
    await runIngestPipeline(jobId, customerId, b64, 'text/plain')
  } catch (err) {
    console.error(`[product-graph] url-ingest ${jobId} failed:`, (err as Error).message)
    updateJobStatus(jobId, 'error', { errorMsg: (err as Error).message })
  }
}

async function runIngestPipeline(
  jobId: string,
  customerId: string,
  base64Content: string,
  mimeType: string
): Promise<void> {
  try {
    updateJobStatus(jobId, 'chunking')
    const text = decodeContent(base64Content, mimeType)
    const chunks = chunkDocument(text)
    updateJobStatus(jobId, 'extracting', { chunkCount: chunks.length })

    const extracted = await extractDocument(chunks, jobId, customerId, (done, total) => {
      if (done % 3 === 0 || done === total) {
        console.log(`[product-graph] job ${jobId}: extracted ${done}/${total} chunks`)
      }
    })

    if (extracted.length === 0) {
      updateJobStatus(jobId, 'done', { nodeCount: 0 })
      return
    }

    insertReviewItems(extracted)
    updateJobStatus(jobId, 'review', { nodeCount: extracted.length })

    console.log(`[product-graph] job ${jobId}: ${extracted.length} nodes ready for review`)
  } catch (err) {
    console.error(`[product-graph] job ${jobId} failed:`, (err as Error).message)
    updateJobStatus(jobId, 'error', { errorMsg: (err as Error).message })
  }
}
