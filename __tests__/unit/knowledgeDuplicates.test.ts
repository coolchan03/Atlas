import { isUsableHash, confirmedDuplicate } from '../../src/knowledge/documents';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const docs = [{ hash: A, bytes: 1000, name: 'book-2023.pdf' }, { hash: B, bytes: 2000, name: 'book-2024.pdf' }];

describe('duplicate documents are only skipped when confirmed', () => {
  it.each([A, A.toUpperCase()])('accepts a real SHA-256 (%s)', (h) => { expect(isUsableHash(h)).toBe(true); });
  it.each([undefined, null, '', 'abc', 'g'.repeat(64), 'a'.repeat(63), 42, {}])('rejects a failed hash: %j', (h) => { expect(isUsableHash(h as any)).toBe(false); });

  it('the same verified bytes are a duplicate', () => {
    expect(confirmedDuplicate(docs, A, 1000)?.name).toBe('book-2023.pdf');
    expect(confirmedDuplicate(docs, A.toUpperCase(), 1000)?.name).toBe('book-2023.pdf');
  });
  it('a different edition (different bytes) is kept, even with a bad size match', () => {
    expect(confirmedDuplicate(docs, 'c'.repeat(64), 1000)).toBeUndefined();
    expect(confirmedDuplicate(docs, A, 999)).toBeUndefined(); // same fingerprint but a different size: not confirmed
  });
  it('a failed hash is never a duplicate, even of another document whose hash also failed', () => {
    expect(confirmedDuplicate(docs, null, 1000)).toBeUndefined();
    expect(confirmedDuplicate(docs, '', 1000)).toBeUndefined();
    const broken = [{ hash: '', bytes: 1000 }, { hash: undefined as any, bytes: 1000 }];
    expect(confirmedDuplicate(broken, '', 1000)).toBeUndefined();
    expect(confirmedDuplicate(broken, A, 1000)).toBeUndefined();
  });
  it('documents saved with a placeholder key are never matched', () => {
    expect(confirmedDuplicate([{ hash: 'unhashed-123', bytes: 5 }], 'unhashed-123', 5)).toBeUndefined();
  });
});
