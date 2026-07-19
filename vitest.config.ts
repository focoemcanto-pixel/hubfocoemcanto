import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vitest/config';

const voiceStudioCore = [
  'app/live/[slug]/voice-studio-project-model.ts',
  'app/live/[slug]/voice-studio-transport-controller.ts',
  'app/live/[slug]/voice-studio-playback.ts',
  'app/live/[slug]/voice-studio-recording.ts',
  'app/live/[slug]/voice-studio-history-engine.ts',
  'app/live/[slug]/voice-studio-commands.ts',
  'app/live/[slug]/voice-studio-asset-store.ts',
  'app/live/[slug]/voice-studio-session.ts',
];

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['app/live/**/*.test.ts'],
    clearMocks: true,
    mockReset: true,
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      include: voiceStudioCore,
      exclude: ['**/*.test.*', '**/*.architecture.test.*', '**/*.compatibility.test.*'],
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: 'coverage',
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
