import 'dotenv/config';

import { defineConfig } from 'prisma/config';

const localDevelopmentDatabaseUrl =
  'postgresql://gateway:gateway_local@127.0.0.1:5432/gateway';

export function resolvePrismaDatabaseUrl(
  environment: NodeJS.ProcessEnv,
  arguments_: string[],
): string {
  if (environment.DATABASE_URL) {
    return environment.DATABASE_URL;
  }

  if (arguments_.includes('migrate')) {
    throw new Error('DATABASE_URL is required for Prisma migrations');
  }

  return localDevelopmentDatabaseUrl;
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: resolvePrismaDatabaseUrl(process.env, process.argv),
  },
});
