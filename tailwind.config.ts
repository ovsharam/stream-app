import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        stream: {
          bg: '#0a0a0a',
          surface: '#111111',
          border: '#1e1e1e',
          primary: '#f0f0f0',
          secondary: '#666666',
          gmail: '#EA4335',
          slack: '#E01E5A',
          x: '#ffffff',
          perplexity: '#20B2AA',
          note: '#F5A623'
        }
      },
      fontFamily: {
        mono: ['var(--font-jetbrains)', 'monospace'],
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif']
      },
      height: {
        header: '48px',
        filter: '40px',
        aibar: '56px'
      },
      padding: {
        'safe-bottom': 'env(safe-area-inset-bottom)'
      }
    }
  },
  plugins: []
}

export default config
