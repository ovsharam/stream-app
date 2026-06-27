/**
 * Behavioral telemetry event schema.
 * The app is the sensor — every interaction is an implicit label.
 */

export type FeedSignalRating = 'confirmed' | 'noise' | 'known'

export type TelemetryEvent =
  | {
      event: 'feed.impression'
      itemId: string
      source: string
      rank?: number
    }
  | {
      event: 'feed.dwell'
      itemId: string
      source: string
      durationMs: number
    }
  | {
      event: 'feed.action'
      itemId: string
      source: string
      action: 'open' | 'dismiss' | 'create_engagement' | 'create_task' | 'share' | 'copy'
      timeToActionMs?: number
    }
  | {
      event: 'feed.signal_rate'
      itemId: string
      source: string
      rating: FeedSignalRating
    }
  | {
      event: 'feed.dependency'
      itemId: string
      dependsOnItemId: string
    }
  | {
      event: 'nav.page'
      page: string
      fromPage?: string
      durationMs?: number
    }
  | {
      event: 'app.connect'
      appId: string
    }
  | {
      event: 'app.disconnect'
      appId: string
    }
  | {
      event: 'chat.send'
      surface: 'home' | 'mobile' | 'pipeline'
      queryLength: number
      hasPageContext: boolean
    }
  | {
      event: 'chat.response'
      surface: 'home' | 'mobile' | 'pipeline'
      latencyMs: number
      hadThinking: boolean
      traceId?: string
    }
  | {
      event: 'chat.thinking_expand'
      surface: 'home' | 'mobile' | 'pipeline'
    }
  | {
      event: 'pipeline.engagement_open'
      engagementId: string
      stage: string
    }
  | {
      event: 'demo.phase'
      phase: string
      fast: boolean
    }
  | {
      event: 'demo.case_create'
    }

export type TelemetryPayload = TelemetryEvent & {
  sessionId: string
  userId?: string
  ts: number
  appVersion?: string
}
