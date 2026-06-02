import type { AssistResult, ClusterSearchHit } from '@shared/cluster'
import { formatPortalAssist } from '@shared/assistText'
import { isConversationalQuery, sanitizeDisplayText } from '../lib/displayText'
import { IconGmail, IconMonday } from './Icons'

type Props = {
  query: string
  hits: ClusterSearchHit[]
  assist: AssistResult | null
  searching: boolean
  assistLoading?: boolean
  onDismiss: () => void
  onOpenHit: (hit: ClusterSearchHit) => void
}

function SourceBadge({ source }: { source: string }) {
  if (source === 'gmail') {
    return (
      <span className="x-portal-hit-source x-portal-hit-source-gmail">
        <IconGmail className="x-portal-hit-source-icon" />
        Gmail
      </span>
    )
  }
  if (source === 'monday') {
    return (
      <span className="x-portal-hit-source x-portal-hit-source-monday">
        <IconMonday className="x-portal-hit-source-icon" />
        Monday
      </span>
    )
  }
  return <span className="x-portal-hit-source">{source}</span>
}

function AssistBody({ view }: { view: ReturnType<typeof formatPortalAssist> }) {
  const { body } = view
  const hasStructured = Boolean(body.intro || body.bullets.length)

  if (!hasStructured) {
    const fallback = sanitizeDisplayText(view.response, 900)
    if (!fallback) return null
    return <p className="x-portal-answer-body">{fallback}</p>
  }

  return (
    <div className="x-portal-answer-body">
      {body.intro ? <p className="x-portal-answer-intro">{body.intro}</p> : null}
      {body.bullets.length > 0 ? (
        <ul className="x-portal-answer-list">
          {body.bullets.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : body.plain ? (
        <p>{body.plain}</p>
      ) : null}
    </div>
  )
}

export function PortalSearchResults({
  query,
  hits,
  assist,
  searching,
  assistLoading = false,
  onDismiss,
  onOpenHit
}: Props) {
  const conversational = isConversationalQuery(query)
  const showAssist = assist && (conversational || hits.length === 0)
  const assistView = assist ? formatPortalAssist(assist, query, conversational) : null
  const latentHits =
    assist?.latentContext?.chunks?.slice(0, 4).map((chunk) => ({
      id: `latent-${chunk.datapointId}`,
      title: chunk.title,
      snippet: chunk.excerpt,
      source: chunk.source,
      score: chunk.score
    })) ?? []

  const statusLabel = searching
    ? 'Searching stream…'
    : assistLoading
      ? 'Summarizing…'
      : showAssist && conversational
        ? 'AI answer'
        : `${hits.length} result${hits.length === 1 ? '' : 's'}`

  if (!searching && !assistLoading && hits.length === 0 && !showAssist) {
    return (
      <div className="x-portal-search-results">
        <p className="x-portal-search-empty">No matches for “{query}” in your stream.</p>
      </div>
    )
  }

  return (
    <div className="x-portal-search-results">
      <div className="x-portal-search-results-head">
        <span>
          {statusLabel}
          {query ? ` · ${query}` : ''}
        </span>
        <button type="button" className="x-portal-answer-dismiss" onClick={onDismiss} aria-label="Clear">
          ×
        </button>
      </div>

      {hits.length > 0 ? (
        <ul className="x-portal-hit-list">
          {hits.map((hit) => (
            <li key={hit.id}>
              <button type="button" className="x-portal-hit-card" onClick={() => onOpenHit(hit)}>
                <div className="x-portal-hit-card-top">
                  <SourceBadge source={hit.source} />
                  <span className="x-portal-hit-score">{Math.round(hit.score * 10) / 10}</span>
                </div>
                <p className="x-portal-hit-title">{sanitizeDisplayText(hit.title, 120)}</p>
                <p className="x-portal-hit-snippet">{sanitizeDisplayText(hit.snippet, 160)}</p>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {assistLoading && !assistView ? (
        <article className="x-portal-answer x-portal-answer-compact x-portal-answer-loading">
          <p className="x-portal-answer-kicker">AI summary</p>
          <div className="x-portal-answer-skeleton" aria-hidden />
        </article>
      ) : null}

      {showAssist && assistView ? (
        <article className="x-portal-answer x-portal-answer-compact">
          <p className="x-portal-answer-kicker">AI summary</p>
          {assistView.showHeadline ? (
            <h2 className="x-portal-answer-headline">{assistView.headline}</h2>
          ) : null}
          <AssistBody view={assistView} />
          {assistView.showSayThis ? (
            <p className="x-portal-answer-say">{assistView.sayThis.replace(/^["']|["']$/g, '')}</p>
          ) : null}
          {assist.sources?.length ? (
            <p className="x-portal-answer-sources">
              Sources: {assist.sources.join(' · ')}
            </p>
          ) : null}
        </article>
      ) : null}

      {hits.length === 0 && latentHits.length > 0 ? (
        <div className="x-portal-latent">
          <p className="x-portal-latent-kicker">From your knowledge base</p>
          <ul className="x-portal-hit-list">
            {latentHits.map((hit) => (
              <li key={hit.id}>
                <div className="x-portal-hit-card x-portal-hit-card-static">
                  <div className="x-portal-hit-card-top">
                    <SourceBadge source={hit.source} />
                  </div>
                  <p className="x-portal-hit-title">{sanitizeDisplayText(hit.title, 120)}</p>
                  <p className="x-portal-hit-snippet">{sanitizeDisplayText(hit.snippet, 160)}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
