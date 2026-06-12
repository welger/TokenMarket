import {
  countMessageCharacters,
  countUnicodeCodePoints,
} from './unicode-counter.js';

describe('Unicode metering', () => {
  it.each([
    ['A你😀', 3],
    ['a b\n', 4],
    ['', 0],
    ['👨‍👩‍👧‍👦', 7],
  ])('counts Unicode code points in %j', (value, expected) => {
    expect(countUnicodeCodePoints(value)).toBe(expected);
  });

  it('counts message content without adding hidden separators', () => {
    expect(
      countMessageCharacters([
        { role: 'system', content: 'A你' },
        { role: 'user', content: '😀\n' },
      ]),
    ).toBe(4);
  });
});
