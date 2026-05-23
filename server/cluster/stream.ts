import { getStreamBootstrap } from '../../lib/central-stream-demo'

export function getCentralStream(): ReturnType<typeof getStreamBootstrap> {
  return getStreamBootstrap()
}
