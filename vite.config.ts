import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: { target: 'es2019', chunkSizeWarningLimit: 700 },
  test: { environment: 'node' },
})
