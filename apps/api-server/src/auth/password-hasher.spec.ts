import { PasswordHasher } from './password-hasher.js';

describe('PasswordHasher', () => {
  it('generates one cached Argon2id dummy hash during initialization', async () => {
    const hasher = new PasswordHasher();

    await hasher.onModuleInit();
    const cachedHash = hasher.dummyHash;

    expect(cachedHash).toMatch(/^\$argon2id\$/);
    await expect(
      hasher.verify(cachedHash, 'not-the-dummy-password'),
    ).resolves.toBe(false);
    await expect(
      hasher.verify(cachedHash, 'another-password'),
    ).resolves.toBe(false);
    expect(hasher.dummyHash).toBe(cachedHash);
  });
});
