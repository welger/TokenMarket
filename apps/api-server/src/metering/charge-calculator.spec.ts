import {
  calculateCharge,
  multiplyUnits,
} from './charge-calculator.js';

describe('character charge calculation', () => {
  it.each([
    [3, '1.5', 5n],
    [10, '0.0001', 1n],
    [0, '2.5', 0n],
    [4, '1.25', 5n],
  ])(
    'charges %s characters at %s as %s units',
    (characters, multiplier, expected) => {
      expect(multiplyUnits(characters, multiplier)).toBe(expected);
    },
  );

  it('keeps input and output charges separate', () => {
    expect(
      calculateCharge({
        inputCharacters: 3,
        outputCharacters: 4,
        inputMultiplier: '1.5',
        outputMultiplier: '2',
      }),
    ).toEqual({
      inputChargedUnits: 5n,
      outputChargedUnits: 8n,
      chargedUnits: 13n,
    });
  });

  it.each(['-1', 'NaN', '1.23456', ''])(
    'rejects invalid multiplier %j',
    (multiplier) => {
      expect(() => multiplyUnits(1, multiplier)).toThrow(
        'INVALID_BILLING_MULTIPLIER',
      );
    },
  );
});
