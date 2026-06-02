import { useEffect, useState } from 'react'
import type { CustomMcpAgent } from '@shared/fde-engagement'
import { clusterApi } from '../lib/api'

export function McpAgentsSection() {
  const [agents, setAgents] = useState<CustomMcpAgent[]>([])
  const [name, setName] = useState('')
  const [composeAlias, setComposeAlias] = useState('')
  const [command, setCommand] = useState('npx')
  const [args, setArgs] = useState('')
  const [url, setUrl] = useState('')
  const [transport, setTransport] = useState<'stdio' | 'http' | 'sse'>('stdio')
  const [status, setStatus] = useState<string | null>(null)

  const load = async () => {
    try {
      const data = await clusterApi.mcpAgents()
      setAgents(data.agents)
    } catch {
      setAgents([])
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const save = async () => {
    if (!name.trim()) return
    setStatus(null)
    try {
      await clusterApi.saveMcpAgent({
        name: name.trim(),
        composeAlias: composeAlias.trim() || undefined,
        transport,
        command: transport === 'stdio' ? command.trim() : undefined,
        args: transport === 'stdio' && args.trim() ? args.split(/\s+/).filter(Boolean) : undefined,
        url: transport !== 'stdio' ? url.trim() : undefined,
        enabled: true
      })
      setName('')
      setComposeAlias('')
      setArgs('')
      setUrl('')
      setStatus('Agent saved — registry persists in ~/.stream-app/mcp-agents.json')
      await load()
    } catch (e) {
      setStatus(`Save failed: ${String(e)}`)
    }
  }

  const remove = async (id: string) => {
    await clusterApi.deleteMcpAgent(id)
    await load()
  }

  return (
    <div className="x-int-block x-int-block-first">
      <h4>Your MCP agents</h4>
      <p className="x-int-muted">
        Register MCP servers your agency already runs. Config is stored locally and survives restarts.
        Wire stdio (local CLI) or HTTP/SSE (hosted agent). Compose alias lets you dispatch with{' '}
        <code>@alias ask: …</code> once the executor is connected.
      </p>

      {agents.length > 0 ? (
        <ul className="x-mcp-agent-list">
          {agents.map((a) => (
            <li key={a.id} className="x-mcp-agent-row">
              <div>
                <strong>{a.name}</strong>
                {a.composeAlias ? (
                  <span className="x-mcp-agent-alias">@{a.composeAlias}</span>
                ) : null}
                <p className="x-int-muted">
                  {a.transport === 'stdio'
                    ? `${a.command ?? ''} ${(a.args ?? []).join(' ')}`.trim()
                    : a.url}
                </p>
              </div>
              <button type="button" className="x-int-link" onClick={() => void remove(a.id)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="x-int-muted">No custom agents yet.</p>
      )}

      <div className="x-mcp-agent-form">
        <input
          className="x-int-input"
          placeholder="Agent name (e.g. Deploy bot)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="x-int-input"
          placeholder="Compose alias (e.g. deploy → @deploy)"
          value={composeAlias}
          onChange={(e) => setComposeAlias(e.target.value)}
        />
        <select
          className="x-int-input"
          value={transport}
          onChange={(e) => setTransport(e.target.value as typeof transport)}
        >
          <option value="stdio">stdio — local MCP command</option>
          <option value="http">HTTP — hosted MCP</option>
          <option value="sse">SSE — streaming MCP</option>
        </select>
        {transport === 'stdio' ? (
          <>
            <input
              className="x-int-input"
              placeholder="Command (e.g. npx)"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
            />
            <input
              className="x-int-input"
              placeholder="Args (e.g. -y @your/mcp-server)"
              value={args}
              onChange={(e) => setArgs(e.target.value)}
            />
          </>
        ) : (
          <input
            className="x-int-input"
            placeholder="MCP server URL"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        )}
        <button type="button" className="x-int-btn x-int-btn-wide" disabled={!name.trim()} onClick={() => void save()}>
          Save agent
        </button>
      </div>
      {status ? <p className="x-int-muted">{status}</p> : null}
    </div>
  )
}
