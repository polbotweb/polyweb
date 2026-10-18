import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@i18n': resolve(__dirname, 'src/i18n'),
      '@components': resolve(__dirname, 'src/components'),
      '@lib': resolve(__dirname, 'src/lib'),
      '@database': resolve(__dirname, 'src/database'),
      '@smtp': resolve(__dirname, 'src/smtp'),
      '@media': resolve(__dirname, 'src/media'),
    },
  },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    environment: 'node',
    env: {
      NODE_ENV: 'test',
    },
    testTimeout: 15_000,
    reporters: ['default', 'json'],
    outputFile: {
      json: 'tests/reports/vitest-results.json',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      reportsDirectory: 'tests/reports/coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/env.d.ts',
        'src/content.config.ts',
        'src/**/*.astro',
        'src/database/migrations/**',
        'src/database/data/**',
        'src/database/commands/**',
        'src/database/drizzle.ts',

        'src/components/**/index.ts',
        'src/components/**/*Types.ts',
        'src/components/**/carousel-script.ts',
        'src/components/**/toast-manager.ts',
        'src/i18n/fr/**',
        'src/i18n/en/**',
        'src/i18n/es/**',
        'src/i18n/ar/**',
        'src/actions/index.ts',
        'src/pages/**',
        'src/middleware.ts',
        'src/lib/starwind/**',
        'src/lib/auth.ts',
        'src/lib/auth-client.ts',
        'src/lib/auth-data.ts',
        'src/smtp/**',
        'src/assets/**',
      ],
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 75,
        lines: 80,
      },
    },
  },
});
