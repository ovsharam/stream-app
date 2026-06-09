import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import type { Server as SocketServer } from 'socket.io'
import { createRouter } from './router'
import { getSessionId, readSessionId } from './session'
import { runWithSession } from './request-context'
import { getCorsOrigins } from './corsOrigins'
import { ensureGeminiFromEnv } from './sources/gemini'
import { ensureClaudeFromEnv } from './sources/claude'

export function createApp(getIo?: () => SocketServer | undefined): express.Application {
  const app = express()

  app.use(
    cors({
      origin: getCorsOrigins(),
      credentials: true
    })
  )
  app.use(cookieParser())
  // Compose actions (e.g. @cursor ask with large build briefs) exceed the 100kb default.
  app.use(express.json({ limit: '5mb' }))

  app.use((err: unknown, _req, res, next) => {
    if (
      err &&
      typeof err === 'object' &&
      'type' in err &&
      (err as { type?: string }).type === 'entity.too.large'
    ) {
      res.status(413).json({
        error: 'Request body too large — shorten your prompt and try again'
      })
      return
    }
    next(err)
  })

  app.use((req, res, next) => {
    const sid = readSessionId(req) ?? getSessionId(req, res)
    runWithSession(sid, () => {
      ensureGeminiFromEnv(sid)
      ensureClaudeFromEnv(sid)
      next()
    })
  })

  const router = () => createRouter(getIo?.())
  app.use('/api', router())
  app.use('/', router())

  return app
}
