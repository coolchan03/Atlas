/**
 * Turns a raw failure into something a person can act on: what failed, the likely cause (only when it can be told from the message),
 * a safe next step, and whether trying the same thing again can help. Also makes diagnostics safe to share. Pure.
 */
export type ErrorKind = 'permission' | 'offline' | 'corrupt-file' | 'unsupported-file' | 'memory' | 'backend' | 'checksum' | 'storage' | 'cancelled' | 'unknown';
export interface ErrorExplanation { kind: ErrorKind; what: string; cause?: string; next: string; /** True only when the same step is safe and likely to work if repeated. */ retryable: boolean }

const RULES: Array<{ kind: ErrorKind; test: RegExp; cause: string; next: string; retryable: boolean }> = [
  { kind: 'cancelled', test: /cancel|aborted|user_cancelled/i, cause: 'It was stopped before it finished.', next: 'Nothing was changed. Start it again when you are ready.', retryable: true },
  { kind: 'permission', test: /permission|denied|not allowed|EACCES|securityexception|revoked|unauthori[sz]ed|\b40[13]\b/i, cause: 'Atlas does not have access to it (permission denied or revoked).', next: 'Choose the file again, or allow access in Android settings. Atlas only reads what you pick.', retryable: false },
  { kind: 'checksum', test: /checksum|sha-?256|integrity|file_corrupted|hash mismatch/i, cause: 'The file arrived changed or incomplete, so it was not used.', next: 'Download it again. A file that fails this check is never loaded.', retryable: true },
  { kind: 'corrupt-file', test: /corrupt|malformed|invalid (pdf|zip|archive|wav|json)|unexpected end|truncated|not a valid|bad zip|damaged/i, cause: 'The file is damaged or cut short.', next: 'Try a different copy of the file. Your original was not changed.', retryable: false },
  { kind: 'unsupported-file', test: /unsupported|not supported|unknown (format|type)|must be (a|an)|only .* files|no text found|scanned/i, cause: 'Atlas cannot read this kind of file, or it has no readable text (a scan or pictures).', next: 'Pick a text, PDF, Word, PowerPoint, Excel, EPUB or RTF file, or use a version that has real text.', retryable: false },
  { kind: 'memory', test: /out of memory|oom|insufficient memory|not enough memory|memory budget|alloc/i, cause: 'The model needs more memory than is free right now.', next: 'Close other apps, lower the context size, or pick a smaller model. Atlas will not change your model for you.', retryable: false },
  { kind: 'backend', test: /vulkan|opencl|npu|backend|gpu|libllama|dlopen|unsatisfiedlink|no model loaded/i, cause: 'The chosen way of running the model (GPU, NPU or CPU) is not working on this phone.', next: 'Try another backend in the model settings. CPU is slower but works on every phone, and Atlas only switches to it if you choose.', retryable: false },
  { kind: 'storage', test: /enospc|no space|disk full|not enough (storage|space)|free space/i, cause: 'The phone is out of storage.', next: 'Free some space (Storage settings shows what uses it) and try again.', retryable: true },
  { kind: 'offline', test: /network|offline|timed out|timeout|econn|enotfound|unreachable|failed to fetch|socket|dns/i, cause: 'The internet or the server could not be reached.', next: 'Check your connection and try again. Offline features keep working.', retryable: true },
];

export function explainError(err: unknown, what = 'That did not work'): ErrorExplanation {
  const message = String((err as { message?: unknown })?.message ?? err ?? '');
  const hit = RULES.find((r) => r.test.test(message));
  if (!hit) return { kind: 'unknown', what, next: 'Nothing was lost. You can try again, and share the details below if it keeps happening.', retryable: false };
  return { kind: hit.kind, what, cause: hit.cause, next: hit.next, retryable: hit.retryable };
}

/** Removes what must not leave the phone: tokens and keys, emails, file paths, long digit runs (PINs, phone numbers), coordinates. */
export function redactDiagnostics(text: string): string {
  return text
    .replace(/\b(bearer|token|api[_-]?key|authorization|password|pin|secret)\b\s*[:=]?\s*(?:bearer\s+|basic\s+)?\S+/gi, '$1 [redacted]')
    .replace(/\b(sk|hf|ghp|gho|xox[abp])[-_][A-Za-z0-9_-]{8,}\b/g, '[redacted]')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
    .replace(/(?:file:\/\/)?\/(?:storage|sdcard|data|home|Users|var)\/[^\s"'<>)]*/g, '[path]')
    .replace(/-?\d{1,3}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}/g, '[location]')
    .replace(/\b\d{4,}\b/g, '[number]');
}

/** The text offered by "Share details": the plain explanation plus the redacted raw message. */
export function diagnosticsFor(err: unknown, what: string): string {
  const e = explainError(err, what);
  const raw = redactDiagnostics(String((err as { message?: unknown })?.message ?? err ?? '')).slice(0, 600);
  return [`What failed: ${e.what}`, e.cause && `Likely cause: ${e.cause}`, `Next step: ${e.next}`, `Details: ${raw}`].filter(Boolean).join('\n');
}
