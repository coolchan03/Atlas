import { speechSafe } from '../../src/utils/emoji';

describe('speechSafe removes what a voice cannot say and keeps what a person would', () => {
  it.each([
    ['Great job 😀 well done', 'Great job well done'],
    ['Done ✅ and ❤️ and 👍🏽', 'Done and and'],
    ['Family 👨‍👩‍👧 trip', 'Family trip'],
    ['Flag 🇬🇧 here', 'Flag here'],
    ['Nice :) work ;-)', 'Nice work'],
    ['Step 1 → step 2', 'Step 1 → step 2'], // arrows are left to the voice engine
    ['Cost​ is﻿ 5', 'Cost is 5'],
    ['soft­hyphen', 'softhyphen'],
    ['Icon  here', 'Icon here'],
    ['bad � char', 'bad char'],
    ['ctrl\u0007bell', 'ctrlbell'],
    ['Total ──── 5', 'Total 5'],
  ])('%j -> %j', (input, expected) => { expect(speechSafe(input).replace(/ +/g, ' ').trim()).toBe(expected); });

  it.each([
    'Hello, world. How are you?',
    'Price: $5.99, €4, £3 and 12% at 21°C.',
    'Café crème, naïve façade, über.',
    'Привет, мир!',
    '你好，世界。',
    'مرحبا بالعالم',
    'नमस्ते दुनिया',
    'Half is ½ and a quarter is ¼.',
    'Wait… then — go.',
    'Line one.\nLine two.\n\nNew paragraph.',
    '(c) 2026 © Atlas™'.replace('™', ''),
  ])('leaves ordinary text alone: %j', (text) => { expect(speechSafe(text)).toBe(text); });

  it('keeps a zero-width non-joiner inside a Persian word and a joiner inside an Indic one', () => {
    const persian = 'می‌خواهم';
    const indic = 'क्‍ष';
    expect(speechSafe(persian)).toBe(persian);
    expect(speechSafe(indic)).toBe(indic);
  });

  it('keeps line breaks (they are pauses) and does not collapse them', () => {
    expect(speechSafe('One \u{1F600}\n\nTwo')).toBe('One\n\nTwo'.replace('One', 'One '));
  });

  it('text that is only emoji becomes nothing to say', () => {
    expect(speechSafe('\u{1F600}\u{1F44D}✅').trim()).toBe('');
  });

  it('empty and plain input pass through', () => {
    expect(speechSafe('')).toBe('');
    expect(speechSafe('plain')).toBe('plain');
  });
});
