import { createRoot } from 'react-dom/client'
import MobileApp from './mobile/MobileApp'
import './stream-tokens.css'
import './index.css'

createRoot(document.getElementById('root')!).render(<MobileApp />)
