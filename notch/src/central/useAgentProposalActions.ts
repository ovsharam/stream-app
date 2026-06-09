import { useCallback, useState } from 'react'
import { loadAgentActionSettings } from '@shared/agent-action-settings'
import { agentApi } from '../lib/api'
import { armLinkedInPaste } from './linkedinComposeFill'

export type ProposalResolvedAction = 'sent' | 'cleared' | 'reminded' | 'copied'

export function dispatchProposalSync(proposalId: string, action: ProposalResolvedAction): void {
  window.dispatchEvent(
    new CustomEvent('notch:agent-proposal-resolved', { detail: { proposalId, action } })
  )
  window.dispatchEvent(new Event('notch:agent-proposal'))
  window.dispatchEvent(new Event('notch:stream-push'))
}

export function useAgentProposalActions() {
  const [busyIds, setBusyIds] = useState<Set<string>>(() => new Set())

  const setBusy = useCallback((proposalId: string, busy: boolean) => {
    setBusyIds((prev) => {
      const next = new Set(prev)
      if (busy) next.add(proposalId)
      else next.delete(proposalId)
      return next
    })
  }, [])

  const isBusy = useCallback((proposalId: string) => busyIds.has(proposalId), [busyIds])

  const saveDraft = useCallback(async (proposalId: string, linkedinReply: string) => {
    try {
      const { proposal } = await agentApi.updateDraft(proposalId, linkedinReply)
      return { ok: true as const, proposal }
    } catch (err) {
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : 'Save failed'
      }
    }
  }, [])

  const regenerate = useCallback(async (proposalId: string) => {
    setBusy(proposalId, true)
    try {
      const { proposal } = await agentApi.refreshProposal(proposalId)
      return { ok: true as const, proposal }
    } catch (err) {
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : 'Regenerate failed'
      }
    } finally {
      setBusy(proposalId, false)
    }
  }, [setBusy])

  const sendFromHere = useCallback(
    async (
      proposalId: string,
      opts?: { threadId?: string; linkedinReply?: string; senderName?: string }
    ) => {
      setBusy(proposalId, true)
      try {
        const { proposal } = await agentApi.approveProposal(proposalId, {
          linkedinReply: opts?.linkedinReply
        })
        try {
          await navigator.clipboard.writeText(proposal.linkedinReplyDraft)
        } catch {
          /* optional */
        }
        dispatchProposalSync(proposalId, 'sent')
        const reply = proposal.linkedinReplyDraft
        const threadId = opts?.threadId
        const senderName = opts?.senderName ?? proposal.senderName
        if (threadId && reply) {
          armLinkedInPaste({ threadId, replyText: reply, senderName })
          window.dispatchEvent(
            new CustomEvent('notch:open-linkedin-thread', {
              detail: { threadId, senderName }
            })
          )
          window.setTimeout(() => {
            window.dispatchEvent(
              new CustomEvent('notch:linkedin-paste-reply', {
                detail: { threadId, replyText: reply, senderName }
              })
            )
          }, 450)
        } else if (threadId) {
          window.dispatchEvent(
            new CustomEvent('notch:open-linkedin-thread', {
              detail: { threadId, senderName }
            })
          )
        }
        return { ok: true as const, proposal }
      } catch (err) {
        return {
          ok: false as const,
          error: err instanceof Error ? err.message : 'Send failed'
        }
      } finally {
        setBusy(proposalId, false)
      }
    },
    [setBusy]
  )

  const clear = useCallback(
    async (proposalId: string) => {
      setBusy(proposalId, true)
      try {
        await agentApi.rejectProposal(proposalId, 'cleared')
        dispatchProposalSync(proposalId, 'cleared')
        return { ok: true as const }
      } catch (err) {
        return {
          ok: false as const,
          error: err instanceof Error ? err.message : 'Clear failed'
        }
      } finally {
        setBusy(proposalId, false)
      }
    },
    [setBusy]
  )

  const remindLater = useCallback(
    async (proposalId: string, linkedinReply: string, remindInMs?: number) => {
      setBusy(proposalId, true)
      try {
        const ms = remindInMs ?? loadAgentActionSettings().remindLaterMs
        await agentApi.snoozeProposal(proposalId, { linkedinReply, remindInMs: ms })
        dispatchProposalSync(proposalId, 'reminded')
        return { ok: true as const }
      } catch (err) {
        return {
          ok: false as const,
          error: err instanceof Error ? err.message : 'Remind later failed'
        }
      } finally {
        setBusy(proposalId, false)
      }
    },
    [setBusy]
  )

  return { sendFromHere, clear, remindLater, saveDraft, regenerate, isBusy }
}
