import { useEffect, useRef } from 'react'
import type { EmbedBrowseKind } from './embedBrowse'
import {
  clearArmedLinkedInPaste,
  getArmedLinkedInPaste,
  navigateToLinkedInThread,
  pasteReplyToLinkedIn,
  type LinkedInPasteDetail,
  type WebviewEl
} from './linkedinComposeFill'
import { pushNotification } from './notificationHistoryStore'

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
        pushNotification({
          id: `linkedin-paste-${threadId}`,
          kind: 'info',
          title: 'LinkedIn',
          subtitle: result.sendReady
            ? 'Draft pasted — review and tap Send in LinkedIn'
            : 'Draft pasted in the message box',
        })
        return
      }
      pushNotification({
        id: `linkedin-paste-fail-${threadId}`,
        kind: 'info',
        title: 'LinkedIn',
        subtitle: 'Reply copied — paste into the message box (⌘V)',
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

    const onFocus = (e: Event) => {
      const detail = (e as CustomEvent<Pick<LinkedInPasteDetail, 'threadId' | 'senderName'>>).detail
      if (!detail?.threadId || busyRef.current) return
      busyRef.current = true
      void navigateToLinkedInThread(webviewEl as WebviewEl, detail.threadId, {
        senderName: detail.senderName
      })
        .then((result) => {
          if (result.ok) return
          pushNotification({
            id: `linkedin-focus-${detail.threadId}`,
            kind: 'info',
            title: 'LinkedIn',
            subtitle: 'Opened messaging — find the conversation in your inbox',
          })
        })
        .finally(() => {
          busyRef.current = false
        })
    }

    window.addEventListener('notch:linkedin-focus-thread', onFocus)
    return () => {
      window.removeEventListener('notch:linkedin-paste-reply', onPaste)
      window.removeEventListener('notch:linkedin-focus-thread', onFocus)
    }
  }, [webviewEl, domReady, embedBrowseKind])
}
