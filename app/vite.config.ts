import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Base '' so the built bundle works from any static path - the Solo mode "static-hosted
// demo IS the product" story. React + React DOM are pinned into their own vendor chunk so
// they cache across app updates; the eight zones code-split themselves via React.lazy in
// App.tsx (React Flow rides along in the Map zone's chunk, off the initial load).
export default defineConfig({
  base: '',
  plugins: [react()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
        },
      },
    },
  },
})
