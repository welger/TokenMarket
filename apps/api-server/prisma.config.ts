import 'dotenv/config';

import { defineConfig } from 'prisma/config';

import { resolvePrismaDatabaseUrl } from './prisma-database-url.js';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'pnpm prisma:seed',
  },
  datasource: {
    url: resolvePrismaDatabaseUrl(process.env, process.argv),
  },
});
