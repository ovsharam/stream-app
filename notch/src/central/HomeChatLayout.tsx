import { HomeChat } from './HomeChat'
import { HomeChatSidebar } from './HomeChatSidebar'
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
    <div className={`x-home-shell${chat.showRail ? ' x-home-shell-rail' : ''}`}>
      {chat.showRail ? (
        <HomeChatSidebar
          sessions={chat.sessions}
          activeId={chat.activeId}
          onNewChat={chat.newChat}
          onSelect={chat.selectSession}
          onDelete={chat.deleteSession}
        />
      ) : null}
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
