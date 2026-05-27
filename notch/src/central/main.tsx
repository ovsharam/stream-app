import { createRoot } from 'react-dom/client'
import { CentralApp } from './CentralApp'
import './central.css'

if (
  typeof window !== 'undefined' &&
  (window.notchDesktop != null || /Electron/i.test(navigator.userAgent))
) {
  document.documentElement.classList.add('x-electron')
}

createRoot(document.getElementById('root')!).render(<CentralApp />)
