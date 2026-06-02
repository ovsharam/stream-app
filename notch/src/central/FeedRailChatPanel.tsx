import { useMemo } from 'react'
import type { CentralStreamEvent } from '@shared/cluster'
import { HomeChat } from './HomeChat'
import { useHomeChat } from './homeChatContext'
import { groupSessionsByDate } from './homeChatStore'

type Props = {
  events: CentralStreamEvent[]
  onOpenHome?: () => void
}

export function FeedRailChatPanel({ events, onOpenHome }: Props) {
  const chat = useHomeChat()
  const sessionGroups = useMemo(() => groupSessionsByDate(chat.sessions), [chat.sessions])

  return (
    <div className="x-rail-chat">
      <div className="x-rail-chat-head">
        <div className="x-rail-chat-head-row">
          <button type="button" className="x-rail-chat-new" onClick={chat.newChat}>
            New chat
          </button>
          {onOpenHome ? (
            <button type="button" className="x-rail-chat-expand" onClick={onOpenHome}>
              Open full
            </button>
          ) : null}
        </div>
        {chat.sessions.length > 0 ? (
          <div className="x-rail-chat-sessions">
            {sessionGroups.map((group) => (
              <div key={group.label} className="x-rail-chat-session-group">
                <p className="x-rail-chat-session-label">{group.label}</p>
                <ul className="x-rail-chat-session-list">
                  {group.sessions.slice(0, 4).map((session) => (
                    <li key={session.id}>
                      <button
                        type="button"
                        className={`x-rail-chat-session${session.id === chat.activeId ? ' active' : ''}`}
                        onClick={() => chat.selectSession(session.id)}
                      >
                        {session.title}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <div className="x-rail-chat-body">
        <HomeChat
          compact
          events={events}
          messages={chat.messages}
          onMessagesChange={chat.setMessages}
          onFocusMeeting={() => {}}
        />
      </div>
    </div>
  )
}
