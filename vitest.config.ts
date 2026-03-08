import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@factory': path.resolve(__dirname, 'src/factory'),
      '@governor': path.resolve(__dirname, 'src/governor'),
      '@eval': path.resolve(__dirname, 'src/eval'),
      '@mechanic': path.resolve(__dirname, 'src/mechanic'),
      '@orchestrator': path.resolve(__dirname, 'src/orchestrator'),
      '@workers': path.resolve(__dirname, 'src/workers'),
      '@primitives': path.resolve(__dirname, 'src/primitives'),
      '@dashboard': path.resolve(__dirname, 'src/dashboard'),
      '@librarian': path.resolve(__dirname, 'src/librarian'),
    },
  },
  test: {
    globals: true,
    include: ['src/**/*.test.ts'],
  },
})
