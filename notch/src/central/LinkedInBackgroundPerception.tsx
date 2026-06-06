import { EmbeddedWebview } from './EmbeddedWebview'
import { EMBED_BROWSE_PARTITIONS, LINKEDIN_MESSAGING_URL } from './embedBrowse'

/** Hidden LinkedIn webview — watches messaging while you stay on Feed / Agent rail. */
export function LinkedInBackgroundPerception() {
  return (
    <div className="x-linkedin-perception-host" aria-hidden="true">
      <EmbeddedWebview
        className="x-linkedin-perception-webview"
        src={LINKEDIN_MESSAGING_URL}
        partition={EMBED_BROWSE_PARTITIONS.linkedin}
        embedBrowseKind="linkedin"
        agentPerceptionMode="background"
      />
    </div>
  )
}
