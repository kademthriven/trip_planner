import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // MapLibre creates its own module worker. Vite 8's dependency optimizer can
  // cache that worker as a separate generated file, which is fragile in synced
  // folders such as OneDrive. Let the browser load MapLibre's native ESM build.
  optimizeDeps: {
    exclude: ['maplibre-gl'],
  },
})
