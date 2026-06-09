import { useCallback, useEffect, useRef } from 'react'
import { agentApi } from '../lib/api'
import { dismissAppToast, pushAppToast } from './appToastStore'

const SEEN_KEY = 'notch.agentProposals.seen'

function loadSeenIds(): Set<string> {
  try {
    const raw = sessionStorage.getItem(SEEN_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as string[]
    return new Set(parsed)
  } catch {
    return new Set()
  }
}

function saveSeenIds(ids: Set<string>): void {
  try {
    sessionStorage.setItem(SEEN_KEY, JSON.stringify([...ids].slice(-200)))
  } catch {
    /* ignore */
  }
}

function showBrowserNotification(title: string, body: string, proposalId: string): void {
  if (typeof Notification === 'undefined') return
  if (Notification.permission === 'granted') {
    const n = new Notification(title, { body, tag: `agent-${proposalId}` })
    n.onclick = () => {
      window.focus()
      window.dispatchEvent(new CustomEvent('notch:open-agent-inbox', { detail: { proposalId } }))
    }
  }
}

async function notifyNewProposals(seen: Set<string>): Promise<Set<string>> {
  try {
    const data = await agentApi.listProposals('pending')
    const fresh = data.proposals.filter((p) => !seen.has(p.id))
    if (fresh.length === 0) return seen

    const next = new Set(seen)
    for (const proposal of fresh) {
      next.add(proposal.id)
      const title = `LinkedIn draft — ${proposal.senderName}`
      const body =
        proposal.brief?.humanSummary?.slice(0, 140) ||
        proposal.rawMessage.slice(0, 140) ||
        'New agent reply ready for review'

      if (window.notchDesktop?.showNotification) {
        void window.notchDesktop.showNotification({ title, body, proposalId: proposal.id })
      } else {
        showBrowserNotification(title, body, proposal.id)
      }

      const toastId = pushAppToast({
        kind: 'agent',
        title: `LinkedIn — ${proposal.senderName}`,
        subtitle: body,
        urgency: 'normal',
        dedupeKey: `agent-${proposal.id}`,
        expiresAt: Date.now() + 60_000,
        actions: [
          {
            label: 'Review',
            primary: true,
            onClick: () => {
              window.dispatchEvent(
                new CustomEvent('notch:open-agent-inbox', { detail: { proposalId: proposal.id } })
              )
              dismissAppToast(toastId)
            }
          },
          {
            label: 'Dismiss',
            onClick: () => dismissAppToast(toastId)
          }
        ]
      })
    }
    saveSeenIds(next)
    return next
  } catch {
    return seen
  }
}

export function useAgentProposalNotifications(): void {
  const seenRef = useRef<Set<string>>(loadSeenIds())
  const permissionRequested = useRef(false)

  const check = useCallback(async () => {
    seenRef.current = await notifyNewProposals(seenRef.current)
  }, [])

  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      if (!permissionRequested.current) {
        permissionRequested.current = true
        void Notification.requestPermission()
      }
    }

    void check()

    const onProposal = () => void check()
    window.addEventListener('notch:agent-proposal', onProposal)

    const offDesktop = window.notchDesktop?.onOpenAgentProposal?.((proposalId) => {
      window.dispatchEvent(
        new CustomEvent('notch:open-agent-inbox', { detail: { proposalId } })
      )
    })

    return () => {
      window.removeEventListener('notch:agent-proposal', onProposal)
      offDesktop?.()
    }
  }, [check])
}
