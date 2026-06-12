const MULTIPLIER_SCALE = 10_000n;

export interface ChargeInput {
  inputCharacters: number;
  outputCharacters: number;
  inputMultiplier: string | number | { toString(): string };
  outputMultiplier: string | number | { toString(): string };
}

export interface ChargeResult {
  inputChargedUnits: bigint;
  outputChargedUnits: bigint;
  chargedUnits: bigint;
}

export function calculateCharge(input: ChargeInput): ChargeResult {
  const inputChargedUnits = multiplyUnits(
    input.inputCharacters,
    input.inputMultiplier,
  );
  const outputChargedUnits = multiplyUnits(
    input.outputCharacters,
    input.outputMultiplier,
  );
  return {
    inputChargedUnits,
    outputChargedUnits,
    chargedUnits: inputChargedUnits + outputChargedUnits,
  };
}

export function multiplyUnits(
  characters: number,
  multiplier: string | number | { toString(): string },
): bigint {
  if (
    !Number.isSafeInteger(characters) ||
    characters < 0
  ) {
    throw new Error('INVALID_CHARACTER_COUNT');
  }
  const scaledMultiplier = parseMultiplier(multiplier.toString());
  if (characters === 0 || scaledMultiplier === 0n) {
    return 0n;
  }
  const numerator = BigInt(characters) * scaledMultiplier;
  return (
    numerator + MULTIPLIER_SCALE - 1n
  ) / MULTIPLIER_SCALE;
}

function parseMultiplier(value: string): bigint {
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,4}))?$/.exec(value);
  if (!match) {
    throw new Error('INVALID_BILLING_MULTIPLIER');
  }
  const whole = BigInt(match[1]!);
  const fraction = BigInt((match[2] ?? '').padEnd(4, '0') || '0');
  return whole * MULTIPLIER_SCALE + fraction;
}
