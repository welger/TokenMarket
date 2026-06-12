import {
  selectPlan,
  type SelectableUserPlan,
} from './plan-selection.service.js';

function plan(
  id: string,
  expiresAt: string,
  overrides: Partial<SelectableUserPlan> = {},
): SelectableUserPlan {
  return {
    id,
    status: 'ACTIVE',
    expiresAt: new Date(expiresAt),
    activatedAt: new Date('2026-06-01T00:00:00.000Z'),
    createdAt: new Date('2026-05-01T00:00:00.000Z'),
    applicableModelIds: ['test-model'],
    remainingInputQuota: null,
    remainingOutputQuota: null,
    remainingUnifiedQuota: 100n,
    ...overrides,
  };
}

describe('selectPlan', () => {
  it('uses the earliest expiring applicable plan', () => {
    expect(
      selectPlan(
        [
          plan('later', '2026-08-01T00:00:00.000Z'),
          plan('earlier', '2026-07-01T00:00:00.000Z'),
        ],
        'test-model',
        new Date('2026-06-12T00:00:00.000Z'),
      )?.id,
    ).toBe('earlier');
  });

  it('skips exhausted, expired and inapplicable plans', () => {
    expect(
      selectPlan(
        [
          plan('expired', '2026-06-01T00:00:00.000Z'),
          plan('exhausted', '2026-07-01T00:00:00.000Z', {
            remainingUnifiedQuota: 0n,
          }),
          plan('other-model', '2026-07-01T00:00:00.000Z', {
            applicableModelIds: ['other'],
          }),
        ],
        'test-model',
        new Date('2026-06-12T00:00:00.000Z'),
      ),
    ).toBeUndefined();
  });
});
