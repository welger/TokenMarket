export function toJsonSafe(value: unknown): unknown {
  if (typeof value === 'bigint') {
    const maximum = BigInt(Number.MAX_SAFE_INTEGER);
    const minimum = BigInt(Number.MIN_SAFE_INTEGER);
    return value <= maximum && value >= minimum
      ? Number(value)
      : value.toString();
  }
  if (
    value === null ||
    typeof value !== 'object' ||
    value instanceof Date
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => toJsonSafe(item));
  }

  const customJson = (value as { toJSON?: () => unknown }).toJSON;
  if (typeof customJson === 'function') {
    return toJsonSafe(customJson.call(value));
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      toJsonSafe(item),
    ]),
  );
}
