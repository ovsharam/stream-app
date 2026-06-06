import { HomeChat } from './HomeChat'
import { useHomeChat } from './homeChatContext'
import type { CentralStreamEvent, ClusterSearchHit } from '@shared/cluster'

type Props = {
  events: CentralStreamEvent[]
  liveCapture?: boolean
  onFocusMeeting: (itemId: string) => void
  onOpenSearchHit?: (hit: ClusterSearchHit) => void
}

export function HomeChatLayout({
  events,
  liveCapture,
  onFocusMeeting,
  onOpenSearchHit
}: Props) {
  const chat = useHomeChat()

  return (
    <div className="x-home-shell">
      <HomeChat
        events={events}
        liveCapture={liveCapture}
        messages={chat.messages}
        onMessagesChange={chat.setMessages}
        onFocusMeeting={onFocusMeeting}
        onOpenSearchHit={onOpenSearchHit}
      />
    </div>
  )
}
