import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import type { Server as SocketServer } from 'socket.io'
import { createRouter } from './router'
import { getSessionId, readSessionId } from './session'
import { runWithSession } from './request-context'

export function createApp(getIo?: () => SocketServer | undefined): express.Application {
  const app = express()

  app.use(
    cors({
      origin: process.env.APP_URL ?? true,
      credentials: true
    })
  )
  app.use(cookieParser())
  app.use(express.json())

  app.use((req, res, next) => {
    const sid = readSessionId(req) ?? getSessionId(req, res)
    runWithSession(sid, () => next())
  })

  const router = () => createRouter(getIo?.())
  app.use('/api', router())
  app.use('/', router())

  return app
}
