import { defineConfig } from 'drizzle-kit';
import { getDbUrl } from './src/database/env';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/database/schemas.ts',
  out: './src/database/migrations',
  dbCredentials: {
    url: getDbUrl(),
  },
});
