/** Runs in embedded webviews / auth windows before page scripts — reduce automation fingerprints. */
import { webFrame } from 'electron'

const PAGE_SPOOF = `(function() {
  try {
    Object.defineProperty(navigator, 'webdriver', { get: () => false, configurable: true });
    var h = location.hostname || '';
    if (h.endsWith('linkedin.com')) {
      Object.defineProperty(navigator, 'credentials', { value: undefined, configurable: true, writable: true });
    }
  } catch {}
})();`

void webFrame.executeJavaScript(PAGE_SPOOF, true).catch(() => {})

try {
  Object.defineProperty(navigator, 'webdriver', { get: () => false, configurable: true })
} catch {
  /* ignore */
}
