/**
 * Feeds connector chunks through the existing product-graph extraction pipeline.
 * Creates an IngestJob for tracking, streams chunks to the extractor, and inserts
 * review items in batches. Connectors route through the same review queue as
 * manual document ingestion.
 */

import { extractChunk } from '../product-graph/extractor'
import {
  createIngestJob,
  updateJobStatus,
  insertReviewItems,
} from '../product-graph/ingestStore'
import type { ConnectorChunk } from './types'
import type { DocChunk } from '../product-graph/chunker'

const BATCH_SIZE = 5  // insert review items every N chunks

export interface PipelineResult {
  jobId: string
  chunksProcessed: number
  nodesExtracted: number
}

export async function runConnectorPipeline(
  customerId: string,
  connectorLabel: string,
  chunks: AsyncGenerator<ConnectorChunk>
): Promise<PipelineResult> {
  const job = createIngestJob({
    customerId,
    fileName: `[connector] ${connectorLabel}`,
    mimeType: 'text/plain',
  })

  updateJobStatus(job.id, 'extracting')

  let chunksProcessed = 0
  let nodesExtracted = 0
  const batch: Omit<import('../../shared/product-graph').ReviewQueueItem, 'id' | 'status' | 'createdAt'>[] = []
  const seenNames = new Set<string>()

  try {
    for await (const chunk of chunks) {
      if (!chunk.content || chunk.content.trim().length < 50) continue

      const docChunk: DocChunk = {
        index: chunksProcessed,
        heading: chunk.title,
        text: chunk.content,
        charOffset: 0,
      }

      const extracted = await extractChunk(docChunk, job.id, customerId)

      for (const item of extracted) {
        const key = `${item.label}::${item.name.toLowerCase().trim()}`
        if (!seenNames.has(key)) {
          seenNames.add(key)
          batch.push(item)
          nodesExtracted++
        }
      }

      chunksProcessed++

      if (batch.length >= BATCH_SIZE) {
        insertReviewItems(batch.splice(0, batch.length))
      }
    }

    // Flush remaining
    if (batch.length > 0) {
      insertReviewItems(batch)
    }

    updateJobStatus(job.id, 'review', { chunkCount: chunksProcessed, nodeCount: nodesExtracted })
  } catch (err) {
    updateJobStatus(job.id, 'error', { errorMsg: (err as Error).message })
    throw err
  }

  return { jobId: job.id, chunksProcessed, nodesExtracted }
}
