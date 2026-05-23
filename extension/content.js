const DEBOUNCE_MS = 1500
let timer = null

function inferEntityType(url) {
  if (url.includes('lightning.force.com') || url.includes('salesforce.com')) return 'salesforce'
  if (url.includes('mail.google.com')) return 'gmail'
  if (url.includes('linkedin.com')) return 'linkedin'
  if (url.includes('zoom.us')) return 'zoom'
  return 'generic'
}

function inferEntityHint(url) {
  const sf = url.match(/\/Opportunity\/([a-zA-Z0-9]+)/)
  if (sf) return sf[1]
  return undefined
}

function capture() {
  const url = location.href
  const selectedText = window.getSelection()?.toString().trim().slice(0, 500) || undefined

  const payload = {
    url,
    hostname: location.hostname,
    title: document.title,
    entityType: inferEntityType(url),
    entityHint: inferEntityHint(url),
    selectedText,
    timestamp: new Date().toISOString()
  }

  chrome.runtime.sendMessage({ type: 'PAGE_CONTEXT', payload })
}

function scheduleCapture() {
  if (timer) clearTimeout(timer)
  timer = setTimeout(capture, DEBOUNCE_MS)
}

scheduleCapture()

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') scheduleCapture()
})

document.addEventListener('mouseup', () => {
  const sel = window.getSelection()?.toString().trim()
  if (sel && sel.length > 3) scheduleCapture()
})

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'CAPTURE_NOW') capture()
})
