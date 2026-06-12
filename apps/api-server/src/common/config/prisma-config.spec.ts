import { resolvePrismaDatabaseUrl } from '../../../prisma-database-url.js';

const localDevelopmentDatabaseUrl =
  'postgresql://gateway:gateway_local@127.0.0.1:5432/gateway';

describe('resolvePrismaDatabaseUrl', () => {
  it.each(['generate', 'validate', 'format'])(
    'uses the local placeholder URL for the static %s command',
    (command) => {
      expect(resolvePrismaDatabaseUrl({}, ['node', 'prisma', command])).toBe(
        localDevelopmentDatabaseUrl,
      );
    },
  );

  it.each([
    ['migrate', 'dev'],
    ['db', 'push'],
    ['db', 'execute'],
    ['db', 'pull'],
    ['studio'],
    ['db', 'seed'],
  ])(
    'requires an explicit DATABASE_URL for prisma %s %s',
    (...command) => {
      expect(() =>
        resolvePrismaDatabaseUrl({}, ['node', 'prisma', ...command]),
      ).toThrow('DATABASE_URL is required');
    },
  );

  it('always prefers an explicitly supplied DATABASE_URL', () => {
    const explicitDatabaseUrl =
      'postgresql://explicit:local@127.0.0.1:5432/explicit';

    expect(
      resolvePrismaDatabaseUrl(
        { DATABASE_URL: explicitDatabaseUrl },
        ['node', 'prisma', 'migrate', 'status'],
      ),
    ).toBe(explicitDatabaseUrl);
  });
});
