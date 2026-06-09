import { isSyntheticLinkedInThreadId } from '@shared/linkedin-thread'
import { normalizeLinkedInSenderName } from './useLinkedInAgentPoll'

/** Click an inbox row that matches senderName (when we only have a synthetic thread id). */
export function buildLinkedInOpenConversationJs(senderName: string): string {
  const target = JSON.stringify(normalizeLinkedInSenderName(senderName).toLowerCase())
  return `(function() {
    var target = ${target};
    if (!target) return { ok: false, reason: 'no_name' };

    function norm(s) {
      return (s || '').replace(/\\s+/g, ' ').trim().toLowerCase()
        .replace(/\\s+status is offline[\\s\\S]*$/i, '');
    }

    function namesMatch(a, b) {
      if (!a || !b) return false;
      if (a === b) return true;
      if (a.indexOf(b) >= 0 || b.indexOf(a) >= 0) return true;
      var aFirst = a.split(' ')[0];
      var bFirst = b.split(' ')[0];
      return aFirst.length > 2 && aFirst === bFirst;
    }

    var listSelector =
      '.msg-conversation-listitem, li[class*="conversation-listitem"], [data-control-name="conversation"]';
    var items = document.querySelectorAll(listSelector);
    for (var i = 0; i < items.length; i++) {
      var el = items[i];
      var nameEl =
        el.querySelector('.msg-conversation-listitem__participant-names') ||
        el.querySelector('.msg-conversation-card__participant-names') ||
        el.querySelector('h3');
      var name = norm((nameEl && nameEl.textContent) || '');
      if (!namesMatch(name, target)) continue;

      var clickTarget =
        el.querySelector('a[href*="/messaging"]') ||
        el.querySelector('[data-control-name="conversation"]') ||
        el.querySelector('button') ||
        el;
      try {
        clickTarget.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      } catch (e) {
        clickTarget.click();
      }
      return { ok: true, clicked: true, name: name };
    }
    return { ok: false, reason: 'conversation_not_found' };
  })();`
}

export function urlHasRealLinkedInThread(url: string): boolean {
  const match = url.match(/\/messaging\/thread\/([^/?#]+)/)
  if (!match) return false
  return !isSyntheticLinkedInThreadId(decodeURIComponent(match[1]))
}
