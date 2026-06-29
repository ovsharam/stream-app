/**
 * Semantic chunker for product documentation.
 * Splits on markdown headings and paragraph breaks, targeting ~600 tokens per chunk.
 * Each chunk carries its source position for attribution.
 */

export interface DocChunk {
  index: number
  heading?: string
  text: string
  charOffset: number
}

const TARGET_CHARS = 2400  // ~600 tokens at ~4 chars/token
const MAX_CHARS = 3600     // hard cap before forced split
const OVERLAP_CHARS = 240  // carry last ~60 tokens into next chunk for context

const HEADING_RE = /^(#{1,3})\s+(.+)/

export function chunkDocument(content: string): DocChunk[] {
  const lines = content.split('\n')
  const chunks: DocChunk[] = []

  let currentHeading: string | undefined
  let buffer: string[] = []
  let bufferChars = 0
  let charOffset = 0
  let lineOffset = 0

  function flush(force = false) {
    const text = buffer.join('\n').trim()
    if (text.length < 80 && !force) return  // skip tiny fragments
    chunks.push({
      index: chunks.length,
      heading: currentHeading,
      text,
      charOffset: lineOffset
    })
    // carry overlap into next chunk
    const lastLines = buffer.slice(-3)
    buffer = lastLines
    bufferChars = lastLines.join('\n').length
  }

  for (const line of lines) {
    const headingMatch = HEADING_RE.exec(line)

    if (headingMatch) {
      if (bufferChars > 200) flush()
      currentHeading = headingMatch[2].trim()
      buffer = [`# ${currentHeading}`]
      bufferChars = line.length
      lineOffset = charOffset
    } else {
      buffer.push(line)
      bufferChars += line.length + 1

      // Flush on paragraph break if we have enough content
      const isParagraphBreak = line.trim() === '' && buffer.filter(l => l.trim()).length > 0
      if (isParagraphBreak && bufferChars >= TARGET_CHARS) {
        flush()
        lineOffset = charOffset
      }

      // Hard cap — flush regardless
      if (bufferChars >= MAX_CHARS) {
        flush(true)
        lineOffset = charOffset
      }
    }

    charOffset += line.length + 1
  }

  // Final flush
  if (bufferChars > 80) flush(true)

  return chunks
}

/** Decode base64 content from ingest request */
export function decodeContent(base64: string, mimeType: string): string {
  const buf = Buffer.from(base64, 'base64')
  if (mimeType === 'application/pdf') {
    // Basic PDF text extraction: pull text between BT/ET operators
    const raw = buf.toString('latin1')
    const textBlocks: string[] = []
    let i = raw.indexOf('BT')
    while (i !== -1) {
      const end = raw.indexOf('ET', i)
      if (end === -1) break
      const block = raw.slice(i + 2, end)
      // Extract strings from parentheses: (Hello World)
      const strRe = /\(([^)]*)\)/g
      let m: RegExpExecArray | null
      while ((m = strRe.exec(block)) !== null) {
        const s = m[1].replace(/\\n/g, '\n').replace(/\\r/g, '').replace(/\\/g, '')
        if (s.trim().length > 0) textBlocks.push(s)
      }
      i = raw.indexOf('BT', end)
    }
    return textBlocks.join(' ').replace(/\s{3,}/g, '\n\n').trim()
  }
  return buf.toString('utf-8')
}
