import { useEffect, useRef } from 'react'
import type { EmbedBrowseKind } from './embedBrowse'
import {
  clearArmedLinkedInPaste,
  getArmedLinkedInPaste,
  pasteReplyToLinkedIn,
  type LinkedInPasteDetail,
  type WebviewEl
} from './linkedinComposeFill'
import { pushAppToast } from './appToastStore'

function runPaste(
  webviewEl: HTMLElement,
  detail: LinkedInPasteDetail,
  busyRef: { current: boolean }
): void {
  const threadId = detail.threadId.trim()
  const replyText = detail.replyText.trim()
  if (!threadId || !replyText || busyRef.current) return

  busyRef.current = true
  void pasteReplyToLinkedIn(webviewEl as WebviewEl, threadId, replyText, {
    senderName: detail.senderName
  })
    .then((result) => {
      if (result.ok) {
        clearArmedLinkedInPaste()
        pushAppToast({
          kind: 'info',
          title: 'LinkedIn',
          subtitle: result.sendReady
            ? 'Draft pasted — review and tap Send in LinkedIn'
            : 'Draft pasted in the message box',
          dedupeKey: `linkedin-paste-${threadId}`,
          expiresAt: Date.now() + 8000
        })
        return
      }
      pushAppToast({
        kind: 'info',
        title: 'LinkedIn',
        subtitle: 'Reply copied — paste into the message box (⌘V)',
        dedupeKey: `linkedin-paste-fail-${threadId}`,
        expiresAt: Date.now() + 10_000
      })
    })
    .finally(() => {
      busyRef.current = false
    })
}

export function useLinkedInComposePaste(
  webviewEl: HTMLElement | null,
  domReady: boolean,
  embedBrowseKind: EmbedBrowseKind | null | undefined
): void {
  const busyRef = useRef(false)

  useEffect(() => {
    if (embedBrowseKind !== 'linkedin' || !webviewEl || !domReady) return

    const armed = getArmedLinkedInPaste()
    if (armed) runPaste(webviewEl, armed, busyRef)

    const onPaste = (e: Event) => {
      const detail = (e as CustomEvent<LinkedInPasteDetail>).detail
      if (!detail?.threadId || !detail?.replyText) return
      runPaste(webviewEl, detail, busyRef)
    }

    window.addEventListener('notch:linkedin-paste-reply', onPaste)
    return () => window.removeEventListener('notch:linkedin-paste-reply', onPaste)
  }, [webviewEl, domReady, embedBrowseKind])
}
