import { useEffect, useRef } from 'react'
import type { AgentThreadMessage } from '@shared/agent-proposal'
import { linkedInIngestSeenKey } from '@shared/agent-dedupe'
import { agentApi } from '../lib/api'
import { LINKEDIN_MESSAGING_URL } from './embedBrowse'

type WebviewEl = HTMLElement & {
  executeJavaScript?(code: string, userGesture?: boolean): Promise<unknown>
  getURL?(): string
  loadURL?(url: string): void
}

export type LinkedInScanHit = {
  threadId: string
  senderName: string
  message: string
  senderProfileUrl?: string
}

export function normalizeLinkedInSenderName(name: string): string {
  return name.replace(/\s+Status is offline[\s\S]*$/i, '').trim() || name.trim()
}

/** Heuristic DOM scrape — messaging inbox page or overlay widget on any LinkedIn page. */
export const LINKEDIN_MESSAGING_SCAN_JS = `(function() {
  if (!location.hostname.endsWith('linkedin.com')) return [];

  const hits = [];
  const seen = new Set();

  function pushHit(threadId, senderName, message, senderProfileUrl) {
    if (!threadId || !senderName || !message) return;
    const key = threadId + '|' + message.slice(0, 120);
    if (seen.has(key)) return;
    seen.add(key);
    hits.push({ threadId, senderName, message, senderProfileUrl: senderProfileUrl || undefined });
  }

  function threadIdFromListItem(el) {
    var link = el.querySelector('a[href*="/messaging/thread/"]');
    if (!link) link = el.closest('a[href*="/messaging/thread/"]');
    if (link) {
      var hm = (link.getAttribute('href') || '').match(/thread\\/([^/?]+)/);
      if (hm && hm[1] && hm[1].indexOf('li-list-') !== 0) return hm[1];
    }
    var urnAttrs = ['data-conversation-urn', 'data-urn', 'data-event-urn'];
    for (var u = 0; u < urnAttrs.length; u++) {
      var urn = el.getAttribute(urnAttrs[u]) || '';
      var um = urn.match(/msg_conversation:\\(([^)]+)\\)/);
      if (um && um[1]) return um[1];
    }
    for (var i = 0; i < el.attributes.length; i++) {
      var val = el.attributes[i].value || '';
      var tm = val.match(/msg_conversation:\\(([^)]+)\\)/);
      if (tm && tm[1]) return tm[1];
      var hm2 = val.match(/thread\\/([A-Za-z0-9%_-]+)/);
      if (hm2 && hm2[1] && hm2[1].indexOf('li-list-') !== 0) {
        try { return decodeURIComponent(hm2[1]); } catch (e) { return hm2[1]; }
      }
    }
    return null;
  }

  const listSelector =
    '.msg-conversation-listitem, li[class*="conversation-listitem"], [data-control-name="conversation"]';
  const listItems = new Set();
  document.querySelectorAll(listSelector).forEach(function(el) { listItems.add(el); });
  var overlay = document.querySelector('.msg-overlay-list-bubble, #msg-overlay, [data-test-id="msg-overlay"]');
  if (overlay) {
    overlay.querySelectorAll(listSelector).forEach(function(el) { listItems.add(el); });
  }

  var idx = 0;
  listItems.forEach(function(el) {
    const unreadBadge = el.querySelector(
      '[class*="unread-count"], [class*="unread"], .notification-badge, span[class*="badge"]'
    );
    const boldName = el.querySelector('.msg-conversation-listitem__participant-names strong, h3 strong');
    const ariaUnread = (el.getAttribute('aria-label') || '').toLowerCase().includes('unread');
    if (!unreadBadge && !boldName && !ariaUnread) return;

    const nameEl =
      el.querySelector('.msg-conversation-listitem__participant-names') ||
      el.querySelector('.msg-conversation-card__participant-names') ||
      el.querySelector('h3');
    const previewEl =
      el.querySelector('.msg-conversation-listitem__message-snippet') ||
      el.querySelector('p[class*="snippet"]') ||
      el.querySelector('.msg-conversation-card__message-snippet');
    const senderName = ((nameEl && nameEl.textContent) || '').replace(/\\s+/g, ' ').trim();
    const message = ((previewEl && previewEl.textContent) || '').replace(/\\s+/g, ' ').trim();
    let threadId = threadIdFromListItem(el);
    if (!threadId) threadId = 'li-list-' + idx + '-' + senderName.slice(0, 24);
    idx += 1;
    pushHit(threadId, senderName, message, undefined);
  });

  const threadMatch = location.pathname.match(/\\/messaging\\/thread\\/([^/]+)/);
  if (threadMatch) {
    const threadId = threadMatch[1];
    const events = document.querySelectorAll(
      '.msg-s-event-listitem, li[class*="msg-s-event-listitem"], .msg-s-message-list__event'
    );
    let lastInbound = null;
    events.forEach(function(ev) {
      const fromSelf =
        ev.classList.contains('msg-s-event-listitem--other') === false &&
        (ev.querySelector('.msg-s-message-group--self, [class*="message-group--self"]') != null ||
          ev.closest('[class*="message-group--self"]') != null);
      if (fromSelf) return;
      const bodyEl =
        ev.querySelector('.msg-s-event-listitem__body') ||
        ev.querySelector('.msg-s-message-group__content') ||
        ev.querySelector('p');
      const text = ((bodyEl && bodyEl.textContent) || '').replace(/\\s+/g, ' ').trim();
      if (text) lastInbound = text;
    });
    if (lastInbound) {
      const headEl =
        document.querySelector('.msg-thread__link-to-profile') ||
        document.querySelector('.msg-overlay-bubble-header__title') ||
        document.querySelector('h2[class*="thread"]');
      const senderName = ((headEl && headEl.textContent) || 'LinkedIn contact').replace(/\\s+/g, ' ').trim();
      pushHit(threadId, senderName, lastInbound, undefined);
    }
  }

  return hits;
})();`

export const LINKEDIN_THREAD_READ_JS = `(function() {
  if (!location.hostname.endsWith('linkedin.com')) return null;
  const threadMatch = location.pathname.match(/\\/messaging\\/thread\\/([^/]+)/);
  if (!threadMatch) return null;

  const threadId = threadMatch[1];
  const headEl =
    document.querySelector('.msg-thread__link-to-profile') ||
    document.querySelector('.msg-overlay-bubble-header__title') ||
    document.querySelector('h2[class*="thread"]');
  const senderName = ((headEl && headEl.textContent) || 'LinkedIn contact').replace(/\\s+/g, ' ').trim();

  const threadMessages = [];
  const events = document.querySelectorAll(
    '.msg-s-event-listitem, li[class*="msg-s-event-listitem"], .msg-s-message-list__event'
  );

  events.forEach(function(ev) {
    const fromSelf =
      ev.classList.contains('msg-s-event-listitem--other') === false &&
      (ev.querySelector('.msg-s-message-group--self, [class*="message-group--self"]') != null ||
        ev.closest('[class*="message-group--self"]') != null);
    const bodyEl =
      ev.querySelector('.msg-s-event-listitem__body') ||
      ev.querySelector('.msg-s-message-group__content') ||
      ev.querySelector('p');
    const text = ((bodyEl && bodyEl.textContent) || '').replace(/\\s+/g, ' ').trim();
    if (!text) return;
    threadMessages.push({
      sender: fromSelf ? 'self' : 'other',
      senderName: fromSelf ? undefined : senderName,
      text: text
    });
  });

  const inbound = threadMessages.filter(function(m) { return m.sender === 'other'; });
  const message = inbound.length ? inbound[inbound.length - 1].text : '';

  return { threadId: threadId, senderName: senderName, message: message, threadMessages: threadMessages };
})();`

export const LINKEDIN_OBSERVER_INSTALL_JS = `(function() {
  if (!location.hostname.endsWith('linkedin.com')) return;
  if (window.__notchLinkedInObserver) return;
  window.__notchLinkedInObserver = true;

  var debounceTimer = null;
  function schedule() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function() {
      if (typeof window.__notchLinkedIn === 'undefined' || !window.__notchLinkedIn.reportHits) return;
      try {
        var hits = ${LINKEDIN_MESSAGING_SCAN_JS};
        if (hits && hits.length) window.__notchLinkedIn.reportHits(hits);
      } catch (e) {}
    }, 400);
  }

  var observer = new MutationObserver(schedule);
  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    schedule();
  }
})();`

const DEFAULT_INTERVAL_MS = 15_000

type ThreadReadResult = {
  threadId: string
  senderName: string
  message: string
  threadMessages: AgentThreadMessage[]
}

export async function handleIngest(
  webview: WebviewEl | null,
  hits: LinkedInScanHit[],
  seenRef: Set<string>
): Promise<number> {
  let ingested = 0
  for (const hit of hits) {
    const key = linkedInIngestSeenKey({
      threadId: hit.threadId,
      senderName: normalizeLinkedInSenderName(hit.senderName),
      message: hit.message
    })
    if (seenRef.has(key)) continue

    let threadMessages: AgentThreadMessage[] | undefined
    const url = webview?.getURL?.() ?? ''
    if (webview?.executeJavaScript && url.includes(`/messaging/thread/${hit.threadId}`)) {
      try {
        const threadData = (await webview.executeJavaScript(LINKEDIN_THREAD_READ_JS, true)) as
          | ThreadReadResult
          | null
        if (threadData?.threadMessages?.length) {
          threadMessages = threadData.threadMessages
        }
      } catch {
        /* thread read optional */
      }
    }

    try {
      const { duplicate } = await agentApi.ingestLinkedIn({
        threadId: hit.threadId,
        senderName: normalizeLinkedInSenderName(hit.senderName),
        message: hit.message,
        senderProfileUrl: hit.senderProfileUrl,
        threadMessages,
        detectedAt: Date.now()
      })
      seenRef.add(key)
      if (!duplicate) {
        ingested += 1
        window.dispatchEvent(new Event('notch:agent-proposal'))
        window.dispatchEvent(new Event('notch:stream-push'))
      }
    } catch {
      seenRef.add(key)
    }
  }
  return ingested
}

export async function ingestFromHits(
  webview: WebviewEl | null,
  hits: LinkedInScanHit[],
  seenRef: Set<string>
): Promise<number> {
  return handleIngest(webview, hits, seenRef)
}

export function useLinkedInAgentPoll(
  el: HTMLElement | null,
  opts: {
    enabled: boolean
    intervalMs?: number
    backgroundMode?: boolean
    onRealtimeHit?: (hits: LinkedInScanHit[]) => void
  }
) {
  const seenRef = useRef<Set<string>>(new Set())
  const busyRef = useRef(false)
  const navigateBusyRef = useRef(false)

  useEffect(() => {
    const webview = el as WebviewEl | null
    const execJs = webview?.executeJavaScript
    if (!opts.enabled || !webview || !execJs) return

    const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS

    const poll = async () => {
      if (busyRef.current) return
      const url = webview.getURL?.() ?? ''
      if (!url.includes('linkedin.com')) return

      if (opts.backgroundMode && !url.includes('/messaging') && !navigateBusyRef.current) {
        navigateBusyRef.current = true
        try {
          webview.loadURL?.(LINKEDIN_MESSAGING_URL)
        } catch {
          /* webview navigating */
        }
        window.setTimeout(() => {
          navigateBusyRef.current = false
        }, 4000)
        return
      }

      if (!opts.backgroundMode && !url.includes('/messaging') && !url.includes('linkedin.com/feed')) {
        return
      }

      busyRef.current = true
      try {
        const raw = await execJs.call(webview, LINKEDIN_MESSAGING_SCAN_JS, true)
        if (!Array.isArray(raw)) return

        const hits = raw as LinkedInScanHit[]
        if (hits.length === 0) return
        opts.onRealtimeHit?.(hits)
        await handleIngest(webview, hits, seenRef.current)
      } catch {
        /* webview not ready or LinkedIn DOM changed */
      } finally {
        busyRef.current = false
      }
    }

    void poll()
    const timer = window.setInterval(() => void poll(), intervalMs)
    return () => window.clearInterval(timer)
  }, [el, opts.enabled, opts.intervalMs, opts.backgroundMode, opts.onRealtimeHit])
}
