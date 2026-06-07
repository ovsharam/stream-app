import type { Server as SocketServer } from 'socket.io'
import type { DashboardActivity } from '../../shared/dashboard'
import type { IntentionEpisode } from '../../shared/intention-episode'

let io: SocketServer | undefined

export function bindDashboardSocket(server: SocketServer): void {
  io = server
}

export function emitDashboardActivity(activity: DashboardActivity): void {
  io?.emit('dashboard:activity', activity)
}

export function emitDashboardActivities(activities: DashboardActivity[]): void {
  for (const activity of activities) {
    emitDashboardActivity(activity)
  }
}

export function emitDashboardEpisode(episode: IntentionEpisode): void {
  io?.emit('dashboard:episode', episode)
}
