import { useMemo } from 'react'
import type { CentralStreamEvent } from '@shared/cluster'
import { HomeChat } from './HomeChat'
import { useHomeChat } from './homeChatContext'
import { groupSessionsByDate } from './homeChatStore'
import type { WorkspaceBrowserPageContext } from './workspaceBrowserContext'

type Props = {
  events: CentralStreamEvent[]
  onOpenHome?: () => void
  browserPageContext?: WorkspaceBrowserPageContext | null
}

export function FeedRailChatPanel({ events, onOpenHome, browserPageContext }: Props) {
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
        {browserPageContext ? (
          <div className="x-rail-chat-page-context">
            <span className="x-rail-chat-page-context-label">
              Viewing: {browserPageContext.title}
            </span>
            <span className="x-rail-chat-page-context-url" title={browserPageContext.url}>
              {browserPageContext.hostname}
            </span>
          </div>
        ) : null}
        <HomeChat
          compact
          events={events}
          messages={chat.messages}
          onMessagesChange={chat.setMessages}
          onFocusMeeting={() => {}}
          browserPageContext={browserPageContext}
        />
      </div>
    </div>
  )
}
