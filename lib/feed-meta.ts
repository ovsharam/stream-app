import type { StreamSource } from '@shared/cluster'

export const SOURCE_META: Record<
  StreamSource,
  { handle: string; avatar: string; color: string; bg: string }
> = {
  notch: { handle: '@notch', avatar: 'N', color: '#00ba7c', bg: '#001a12' },
  meet: { handle: '@meet', avatar: 'M', color: '#1d9bf0', bg: '#0a1628' },
  gmail: { handle: '@gmail', avatar: 'G', color: '#f4212e', bg: '#2a0a0c' },
  slack: { handle: '@slack', avatar: 'S', color: '#7856ff', bg: '#150f2a' },
  gong: { handle: '@gong', avatar: 'Go', color: '#ff6b35', bg: '#2a1208' },
  salesforce: { handle: '@salesforce', avatar: 'SF', color: '#00a1e0', bg: '#061820' },
  build: { handle: '@build', avatar: '⚡', color: '#ffd400', bg: '#2a2400' },
  insight: { handle: '@notch', avatar: '✦', color: '#e7e9ea', bg: '#16181c' }
}

export function formatFeedTime(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 15) return 'now'
  if (s < 3600) return `${Math.floor(s / 60)}m`
  return `${Math.floor(s / 3600)}h`
}

export function fakeEngagement(id: string): { replies: number; reposts: number; likes: number } {
  const n = id.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  return {
    replies: (n % 47) + 2,
    reposts: (n % 23) + 1,
    likes: (n % 312) + 12
  }
}
