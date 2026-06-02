import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

const demoMode =
  process.env.DEMO_MODE === '1' || process.env.SIMULATION_MODE === 'true'

export default defineConfig({
  root: resolve(__dirname),
  plugins: [react()],
  base: './',
  define: {
    'import.meta.env.VITE_DEMO_MODE': JSON.stringify(demoMode ? '1' : '')
  },
  server: { port: 5174, strictPort: true },
  build: {
    outDir: resolve(__dirname, 'dist-renderer'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        mobile: resolve(__dirname, 'index.html'),
        central: resolve(__dirname, 'central.html')
      }
    }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@shared': resolve(__dirname, '../shared')
    }
  }
})
