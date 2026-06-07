/** Runs in embedded webviews / auth windows before page scripts — reduce automation fingerprints. */
import { contextBridge, ipcRenderer, webFrame } from 'electron'

const PAGE_SPOOF = `(function() {
  try {
    Object.defineProperty(navigator, 'webdriver', { get: () => false, configurable: true });
    var h = location.hostname || '';
    if (h.endsWith('linkedin.com')) {
      Object.defineProperty(navigator, 'credentials', { value: undefined, configurable: true, writable: true });
    }
    if (h.endsWith('google.com') || h.endsWith('youtube.com') || h.endsWith('googleusercontent.com')) {
      if (!window.chrome) {
        window.chrome = { runtime: {}, loadTimes: function() {}, csi: function() {}, app: {} };
      }
    }
  } catch {}
})();`

void webFrame.executeJavaScript(PAGE_SPOOF, true).catch(() => {})

try {
  Object.defineProperty(navigator, 'webdriver', { get: () => false, configurable: true })
} catch {
  /* ignore */
}

const LINKEDIN_SCAN_FN = `(function scanLinkedInMessagingHits() {
  if (!location.hostname.endsWith('linkedin.com')) return [];
  if (!location.pathname.includes('/messaging')) return [];

  var hits = [];
  var seen = new Set();

  function pushHit(threadId, senderName, message, senderProfileUrl) {
    if (!threadId || !senderName || !message) return;
    var key = threadId + '|' + message.slice(0, 120);
    if (seen.has(key)) return;
    seen.add(key);
    hits.push({ threadId: threadId, senderName: senderName, message: message, senderProfileUrl: senderProfileUrl || undefined });
  }

  var listItems = document.querySelectorAll(
    '.msg-conversation-listitem, li[class*="conversation-listitem"], [data-control-name="conversation"]'
  );
  listItems.forEach(function(el, idx) {
    var unreadBadge = el.querySelector(
      '[class*="unread-count"], [class*="unread"], .notification-badge, span[class*="badge"]'
    );
    var boldName = el.querySelector('.msg-conversation-listitem__participant-names strong, h3 strong');
    var ariaUnread = (el.getAttribute('aria-label') || '').toLowerCase().includes('unread');
    if (!unreadBadge && !boldName && !ariaUnread) return;

    var nameEl =
      el.querySelector('.msg-conversation-listitem__participant-names') ||
      el.querySelector('.msg-conversation-card__participant-names') ||
      el.querySelector('h3');
    var previewEl =
      el.querySelector('.msg-conversation-listitem__message-snippet') ||
      el.querySelector('p[class*="snippet"]') ||
      el.querySelector('.msg-conversation-card__message-snippet');
    var linkEl = el.querySelector('a[href*="/messaging/thread/"]');

    var senderName = ((nameEl && nameEl.textContent) || '').replace(/\\s+/g, ' ').trim();
    var message = ((previewEl && previewEl.textContent) || '').replace(/\\s+/g, ' ').trim();
    var href = (linkEl && linkEl.getAttribute('href')) || '';
    var threadMatch = href.match(/thread\\/([^/?]+)/);
    var threadId = threadMatch ? threadMatch[1] : 'li-list-' + idx + '-' + senderName.slice(0, 24);
    pushHit(threadId, senderName, message, undefined);
  });

  var threadMatch = location.pathname.match(/\\/messaging\\/thread\\/([^/]+)/);
  if (threadMatch) {
    var threadId = threadMatch[1];
    var events = document.querySelectorAll(
      '.msg-s-event-listitem, li[class*="msg-s-event-listitem"], .msg-s-message-list__event'
    );
    var lastInbound = null;
    events.forEach(function(ev) {
      var fromSelf =
        ev.classList.contains('msg-s-event-listitem--other') === false &&
        (ev.querySelector('.msg-s-message-group--self, [class*="message-group--self"]') != null ||
          ev.closest('[class*="message-group--self"]') != null);
      if (fromSelf) return;
      var bodyEl =
        ev.querySelector('.msg-s-event-listitem__body') ||
        ev.querySelector('.msg-s-message-group__content') ||
        ev.querySelector('p');
      var text = ((bodyEl && bodyEl.textContent) || '').replace(/\\s+/g, ' ').trim();
      if (text) lastInbound = text;
    });
    if (lastInbound) {
      var headEl =
        document.querySelector('.msg-thread__link-to-profile') ||
        document.querySelector('.msg-overlay-bubble-header__title') ||
        document.querySelector('h2[class*="thread"]');
      var senderName = ((headEl && headEl.textContent) || 'LinkedIn contact').replace(/\\s+/g, ' ').trim();
      pushHit(threadId, senderName, lastInbound, undefined);
    }
  }

  return hits;
})`

const LINKEDIN_OBSERVER_INSTALL = `(function() {
  if (!location.hostname.endsWith('linkedin.com')) return;
  if (window.__notchLinkedInObserver) return;
  window.__notchLinkedInObserver = true;

  var scanFn = ${LINKEDIN_SCAN_FN};
  var debounceTimer = null;

  function report() {
    if (typeof window.__notchLinkedIn === 'undefined' || !window.__notchLinkedIn.reportHits) return;
    try {
      var hits = scanFn();
      if (hits && hits.length) window.__notchLinkedIn.reportHits(hits);
    } catch (e) {}
  }

  function schedule() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(report, 400);
  }

  var observer = new MutationObserver(schedule);
  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    schedule();
  } else {
    document.addEventListener('DOMContentLoaded', function() {
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
      schedule();
    });
  }
})();`

contextBridge.exposeInMainWorld('__notchLinkedIn', {
  reportHits(hits: unknown) {
    if (!Array.isArray(hits) || hits.length === 0) return
    ipcRenderer.sendToHost('linkedin:hits', hits)
  }
})

void webFrame.executeJavaScript(LINKEDIN_OBSERVER_INSTALL, true).catch(() => {})
