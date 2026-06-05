/** Runs in OAuth / auth BrowserWindows before Google/LinkedIn page scripts. */
import { webFrame } from 'electron'

const STEALTH_JS = `(function() {
  try {
    Object.defineProperty(navigator, 'webdriver', { get: () => false, configurable: true });
    if (!window.chrome) {
      window.chrome = { runtime: {}, loadTimes: function() {}, csi: function() {}, app: {} };
    }
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5],
      configurable: true
    });
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en'],
      configurable: true
    });
  } catch {}
})();`

function injectStealth(): void {
  void webFrame.executeJavaScript(STEALTH_JS, true).catch(() => {})
}

injectStealth()

try {
  Object.defineProperty(navigator, 'webdriver', { get: () => false, configurable: true })
} catch {
  /* ignore */
}
