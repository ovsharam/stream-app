import { findWorkspaceWebview } from './workspacePlayback'

export type WorkspaceBrowserPageContext = {
  url: string
  title: string
  hostname: string
  excerpt?: string
  selectedText?: string
  timestamp: string
}

export const WORKSPACE_PAGE_CAPTURE_JS = `(function() {
  const root =
    document.querySelector('article') ||
    document.querySelector('main') ||
    document.body;
  let excerpt = '';
  if (root) {
    excerpt = (root.innerText || root.textContent || '')
      .replace(/\\s+/g, ' ')
      .trim()
      .slice(0, 3000);
  }
  const desc =
    document.querySelector('meta[name="description"]')?.getAttribute('content') || '';
  const selectedText = (window.getSelection?.()?.toString() || '').trim();
  return {
    title: document.title || '',
    description: desc.slice(0, 500),
    excerpt,
    selectedText: selectedText.slice(0, 2000),
    url: location.href
  };
})();`

type CaptureResult = {
  title?: string
  description?: string
  excerpt?: string
  selectedText?: string
  url?: string
}

export async function captureWorkspaceBrowserContext(
  tabId: string
): Promise<WorkspaceBrowserPageContext | null> {
  if (!tabId) return null
  const el = findWorkspaceWebview(tabId)
  if (!el?.executeJavaScript) return null
  try {
    const result = (await el.executeJavaScript(WORKSPACE_PAGE_CAPTURE_JS, true)) as CaptureResult | null
    if (!result?.url?.startsWith('http')) return null
    let hostname = result.url
    try {
      hostname = new URL(result.url).hostname.replace(/^www\./, '')
    } catch {
      /* keep raw url */
    }
    return {
      url: result.url,
      title: result.title?.trim() || hostname,
      hostname,
      excerpt: result.excerpt?.trim() || result.description?.trim() || undefined,
      selectedText: result.selectedText?.trim() || undefined,
      timestamp: new Date().toISOString()
    }
  } catch {
    return null
  }
}
