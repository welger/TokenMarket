import { resolvePrismaDatabaseUrl } from '../../../prisma.config.js';

const localDevelopmentDatabaseUrl =
  'postgresql://gateway:gateway_local@127.0.0.1:5432/gateway';

describe('resolvePrismaDatabaseUrl', () => {
  it('uses the root .env.example development URL for pure Prisma commands', () => {
    expect(resolvePrismaDatabaseUrl({}, ['node', 'prisma', 'generate'])).toBe(
      localDevelopmentDatabaseUrl,
    );
    expect(resolvePrismaDatabaseUrl({}, ['node', 'prisma', 'validate'])).toBe(
      localDevelopmentDatabaseUrl,
    );
  });

  it('requires an explicit DATABASE_URL for migrations', () => {
    expect(() =>
      resolvePrismaDatabaseUrl({}, ['node', 'prisma', 'migrate', 'dev']),
    ).toThrow('DATABASE_URL is required for Prisma migrations');
  });

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
