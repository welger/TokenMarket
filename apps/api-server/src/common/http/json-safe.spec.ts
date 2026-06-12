import { toJsonSafe } from './json-safe.js';

describe('toJsonSafe', () => {
  it('converts safe bigint values to numbers', () => {
    expect(toJsonSafe({ quota: 1000n })).toEqual({ quota: 1000 });
  });

  it('preserves oversized bigint precision as a string', () => {
    expect(
      toJsonSafe({ quota: BigInt(Number.MAX_SAFE_INTEGER) + 1n }),
    ).toEqual({ quota: '9007199254740992' });
  });
});
