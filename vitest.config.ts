import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: [
        'src/app/**/*.ts',
        'src/utils/**/*.ts',
        'src/components/**/*.ts',
        'src/components/**/*.tsx',
      ],
      exclude: [
        'src/**/*.d.ts',
        'src/App.tsx',
        'src/components/CamCanvas.tsx',
        'src/renderer.tsx',
        'src/main.ts',
        'src/preload.ts',
        'src/types/**',
        'src/test/**',
      ],
    },
  },
});
