const API_BASE = 'http://localhost:3000/api'

async function postContext(payload) {
  try {
    await fetch(`${API_BASE}/browser/context`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload)
    })
  } catch (e) {
    console.warn('[STREAM] context sync failed', e)
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'PAGE_CONTEXT') {
    void postContext(msg.payload).then(() => sendResponse({ ok: true }))
    return true
  }
})

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return
  chrome.tabs.sendMessage(tab.id, { type: 'CAPTURE_NOW' })
})
