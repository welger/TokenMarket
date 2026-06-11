const localDevelopmentDatabaseUrl =
  'postgresql://gateway:gateway_local@127.0.0.1:5432/gateway';

const staticCommands = new Set(['format', 'generate', 'validate']);
const databaseCommands = new Set(['db', 'migrate', 'seed', 'studio']);

export function resolvePrismaDatabaseUrl(
  environment: NodeJS.ProcessEnv,
  arguments_: string[],
): string {
  if (environment.DATABASE_URL) {
    return environment.DATABASE_URL;
  }

  const hasStaticCommand = arguments_.some((argument) =>
    staticCommands.has(argument),
  );
  const hasDatabaseCommand = arguments_.some((argument) =>
    databaseCommands.has(argument),
  );

  if (!hasStaticCommand || hasDatabaseCommand) {
    throw new Error('DATABASE_URL is required');
  }

  return localDevelopmentDatabaseUrl;
}
