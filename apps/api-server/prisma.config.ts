import 'dotenv/config';

import { defineConfig } from 'prisma/config';

import { resolvePrismaDatabaseUrl } from './prisma-database-url.js';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: resolvePrismaDatabaseUrl(process.env, process.argv),
  },
});
