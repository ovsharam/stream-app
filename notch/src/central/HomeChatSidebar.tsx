import { groupSessionsByDate, type HomeChatSession } from './homeChatStore'

type Props = {
  sessions: HomeChatSession[]
  activeId: string | null
  onNewChat: () => void
  onSelect: (id: string) => void
  onDelete: (id: string) => void
}

function ChatIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function HomeChatSidebar({ sessions, activeId, onNewChat, onSelect, onDelete }: Props) {
  const groups = groupSessionsByDate(sessions)

  return (
    <aside className="x-home-chat-rail" aria-label="Chat history">
      <div className="x-home-chat-rail-head">
        <button type="button" className="x-home-chat-rail-new" onClick={onNewChat}>
          <span className="x-home-chat-rail-new-icon" aria-hidden>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </span>
          New chat
        </button>
      </div>

      <div className="x-home-chat-rail-scroll">
        {groups.length === 0 ? (
          <p className="x-home-chat-rail-empty">Your chats will appear here.</p>
        ) : (
          groups.map((group) => (
            <section key={group.label} className="x-home-chat-rail-group">
              <h3 className="x-home-chat-rail-group-label">{group.label}</h3>
              <ul className="x-home-chat-rail-list">
                {group.sessions.map((session) => {
                  const active = session.id === activeId
                  return (
                    <li key={session.id}>
                      <div className={`x-home-chat-rail-item-wrap${active ? ' active' : ''}`}>
                        <button
                          type="button"
                          className="x-home-chat-rail-item"
                          onClick={() => onSelect(session.id)}
                          aria-current={active ? 'true' : undefined}
                        >
                          <span className="x-home-chat-rail-item-icon" aria-hidden>
                            <ChatIcon />
                          </span>
                          <span className="x-home-chat-rail-item-title">{session.title}</span>
                        </button>
                        <button
                          type="button"
                          className="x-home-chat-rail-delete"
                          aria-label={`Delete ${session.title}`}
                          onClick={() => onDelete(session.id)}
                        >
                          ×
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))
        )}
      </div>
    </aside>
  )
}
