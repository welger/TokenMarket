export interface MeteredMessage {
  role: string;
  content: string;
}

export function countUnicodeCodePoints(value: string): number {
  let count = 0;
  for (const _codePoint of value) {
    count += 1;
  }
  return count;
}

export function countMessageCharacters(
  messages: MeteredMessage[],
): number {
  return messages.reduce(
    (total, message) =>
      total + countUnicodeCodePoints(message.content),
    0,
  );
}
