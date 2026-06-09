/** Paste agent draft into LinkedIn messaging compose (embedded webview). */

import { isSyntheticLinkedInThreadId } from '@shared/linkedin-thread'
import { LINKEDIN_MESSAGING_URL } from './embedBrowse'
import { buildLinkedInOpenConversationJs, urlHasRealLinkedInThread } from './linkedinThreadNav'

export type LinkedInPasteDetail = {
  threadId: string
  replyText: string
  senderName?: string
}

let armedPaste: (LinkedInPasteDetail & { at: number }) | null = null

/** Survives tab switch / webview mount races after Send on LinkedIn. */
export function armLinkedInPaste(detail: LinkedInPasteDetail): void {
  armedPaste = { ...detail, at: Date.now() }
}

export function clearArmedLinkedInPaste(): void {
  armedPaste = null
}

export function getArmedLinkedInPaste(maxAgeMs = 60_000): LinkedInPasteDetail | null {
  if (!armedPaste || Date.now() - armedPaste.at > maxAgeMs) return null
  return {
    threadId: armedPaste.threadId,
    replyText: armedPaste.replyText,
    senderName: armedPaste.senderName
  }
}

export type WebviewEl = {
  getURL?: () => string
  loadURL?: (url: string) => void
  executeJavaScript?: (code: string, userGesture?: boolean) => Promise<unknown>
}

export function linkedInThreadUrl(threadId: string): string {
  return `https://www.linkedin.com/messaging/thread/${threadId}/`
}

export function buildLinkedInFillComposeJs(replyText: string): string {
  const payload = JSON.stringify(replyText)
  return `(function() {
    var text = ${payload};
    if (!text || !text.trim()) return { ok: false, reason: 'empty' };

    var selectors = [
      'div.msg-form__contenteditable',
      '.msg-form__msg-content-container div[contenteditable="true"]',
      'form.msg-form div[contenteditable="true"]',
      '.msg-form div[role="textbox"]',
      'div[aria-label="Write a message…"]',
      'div[aria-label="Write a message..."]',
      'footer div[contenteditable="true"]',
      '[contenteditable="true"][data-placeholder]'
    ];

    var el = null;
    for (var i = 0; i < selectors.length; i++) {
      el = document.querySelector(selectors[i]);
      if (el) break;
    }
    if (!el) return { ok: false, reason: 'compose_not_found' };

    try {
      el.focus();
      el.click();

      var inserted = false;
      try {
        var sel = window.getSelection();
        var range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
        inserted = document.execCommand('insertText', false, text);
      } catch (e1) {
        inserted = false;
      }

      if (!inserted) {
        try {
          var dt = new DataTransfer();
          dt.setData('text/plain', text);
          inserted = el.dispatchEvent(
            new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt })
          );
        } catch (e2) {
          inserted = false;
        }
      }

      if (!inserted) {
        el.innerHTML = '';
        var line = document.createElement('p');
        line.textContent = text;
        el.appendChild(line);
        try {
          el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, data: text }));
        } catch (e3) {
          el.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
      el.dispatchEvent(new Event('change', { bubbles: true }));

      var sendBtn =
        document.querySelector('button.msg-form__send-button') ||
        document.querySelector('.msg-form__send-btn') ||
        document.querySelector('form.msg-form button[type="submit"]');
      if (sendBtn && !sendBtn.disabled) {
        return { ok: true, pasted: true, sendReady: true };
      }
      return { ok: true, pasted: true, sendReady: false };
    } catch (err) {
      return { ok: false, reason: String(err && err.message ? err.message : err) };
    }
  })();`
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

export async function pasteReplyToLinkedIn(
  webview: WebviewEl,
  threadId: string,
  replyText: string,
  opts: { maxWaitMs?: number; senderName?: string } = {}
): Promise<{ ok: boolean; reason?: string; sendReady?: boolean }> {
  const exec = webview.executeJavaScript
  if (!exec) return { ok: false, reason: 'no_webview' }

  const synthetic = isSyntheticLinkedInThreadId(threadId)
  const senderName = opts.senderName?.trim()
  if (synthetic && !senderName) return { ok: false, reason: 'no_thread_id' }

  let current = webview.getURL?.() ?? ''
  const onRealThread = urlHasRealLinkedInThread(current)
  const onSyntheticThread = current.includes(`/messaging/thread/${threadId}`)

  if (synthetic) {
    if (!current.includes('/messaging') && webview.loadURL) {
      try {
        webview.loadURL(LINKEDIN_MESSAGING_URL)
      } catch {
        return { ok: false, reason: 'navigate_failed' }
      }
    } else if (onSyntheticThread && webview.loadURL) {
      try {
        webview.loadURL(LINKEDIN_MESSAGING_URL)
      } catch {
        return { ok: false, reason: 'navigate_failed' }
      }
    }
  } else if (!onRealThread && !current.includes(`/messaging/thread/${threadId}`) && webview.loadURL) {
    try {
      webview.loadURL(linkedInThreadUrl(threadId))
    } catch {
      return { ok: false, reason: 'navigate_failed' }
    }
  }

  const deadline = Date.now() + (opts.maxWaitMs ?? 16_000)
  const fillJs = buildLinkedInFillComposeJs(replyText)
  const openJs = senderName ? buildLinkedInOpenConversationJs(senderName) : null
  let openAttempts = 0

  while (Date.now() < deadline) {
    await sleep(500)
    current = webview.getURL?.() ?? ''

    if (synthetic && openJs && !urlHasRealLinkedInThread(current)) {
      if (openAttempts < 8) {
        openAttempts += 1
        try {
          await exec.call(webview, openJs, true)
        } catch {
          /* inbox still loading */
        }
      }
      continue
    }

    try {
      const result = (await exec.call(webview, fillJs, true)) as {
        ok?: boolean
        reason?: string
        sendReady?: boolean
        pasted?: boolean
      } | null
      if (result?.ok) {
        return { ok: true, sendReady: result.sendReady }
      }
      if (result?.reason === 'empty') {
        return { ok: false, reason: 'empty' }
      }
    } catch {
      /* thread still loading */
    }
  }

  try {
    await navigator.clipboard.writeText(replyText)
  } catch {
    /* clipboard fallback best-effort */
  }
  return { ok: false, reason: 'compose_not_found' }
}
