import { diagnosticsFor, explainError, redactDiagnostics } from '../../src/utils/explainError';

describe('UX-19 human-readable errors', () => {
  it.each([
    ['SecurityException: Permission Denial: opening provider', 'permission', false],
    ['Downloaded file failed the SHA-256 check', 'checksum', true],
    ['Could not read this file: invalid PDF structure, unexpected end of file', 'corrupt-file', false],
    ['No text found in this PDF (it may be scanned pictures).', 'unsupported-file', false],
    ['java.lang.OutOfMemoryError: failed to allocate', 'memory', false],
    ['Vulkan shader compile failed', 'backend', false],
    ['ENOSPC: no space left on device', 'storage', true],
    ['Network request failed', 'offline', true],
    ['Download was cancelled.', 'cancelled', true],
  ])('%s -> %s (retryable %s)', (message, kind, retryable) => {
    const e = explainError(new Error(message as string), 'Failed');
    expect(e.kind).toBe(kind); expect(e.retryable).toBe(retryable);
    expect(e.next.length).toBeGreaterThan(10);
  });
  it('never offers a retry for something it cannot identify', () => {
    const e = explainError(new Error('weird'), 'Failed');
    expect(e).toMatchObject({ kind: 'unknown', retryable: false });
    expect(e.cause).toBeUndefined();
  });
  it('redacts tokens, paths, emails, PINs and coordinates from shared diagnostics', () => {
    const raw = 'GET failed Authorization: Bearer abc123SECRET for /storage/emulated/0/Taxes/return.pdf by me@example.com pin 123456 at 40.71280, -74.00600';
    const out = redactDiagnostics(raw);
    for (const leak of ['abc123SECRET', '/storage/emulated', 'me@example.com', '123456', '40.71280']) expect(out).not.toContain(leak);
    expect(diagnosticsFor(new Error(raw), 'Import')).toMatch(/What failed: Import[\s\S]*Details:/);
    expect(diagnosticsFor(new Error(raw), 'Import')).not.toContain('abc123SECRET');
  });
});
