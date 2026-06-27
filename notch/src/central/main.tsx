import { createRoot } from 'react-dom/client'
import { CentralApp } from './CentralApp'
import { applyThemeToDocument, readStoredTheme } from './useTheme'
import './central.css'
import './enterprise.css'

if (
  typeof window !== 'undefined' &&
  (window.notchDesktop != null || /Electron/i.test(navigator.userAgent))
) {
  document.documentElement.classList.add('x-electron')
}

applyThemeToDocument(readStoredTheme())

createRoot(document.getElementById('root')!).render(<CentralApp />)
