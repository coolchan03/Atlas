/**
 * Retrieved web pages, PDFs and documents are evidence, never instructions. Besides telling the model so, this removes the
 * sentences that read like commands aimed at an AI, before the model ever sees them.
 */
const INJECTION: RegExp[] = [
  /\bignore\b[^.!?\n]{0,40}\b(?:previous|prior|above|earlier|all|any)\b[^.!?\n]{0,30}\b(?:instructions?|prompts?|rules?)\b/i,
  /\bdisregard\b[^.!?\n]{0,50}\b(?:instructions?|rules?|prompt)\b/i,
  /\b(?:system|developer) (?:prompt|message|instructions?)\b/i,
  /\byou (?:must|should|will|are to) (?:now|immediately|instead)\b/i,
  /\b(?:reveal|print|repeat|leak|send|exfiltrate)\b[^.!?\n]{0,40}\b(?:prompt|instructions?|password|api key|secret|token)\b/i,
  /\bdo not (?:tell|inform|mention)[^.!?\n]{0,25}\b(?:user|human)\b/i,
  /\bact as (?:an?|the) [a-z ]{2,30}(?:with no|without)\b/i,
  /<\/?(?:system|assistant|instructions?)>/i,
  /\bBEGIN (?:SYSTEM|INSTRUCTIONS?)\b/i,
];

/** The text without instruction-like sentences, and how many were removed. */
export function stripInjection(text: string): { text: string; removed: number } {
  let removed = 0;
  const kept = (text.match(/[^.!?\n]+[.!?]*\s*|\n/g) ?? [text]).filter((sentence) => {
    if (INJECTION.some((p) => p.test(sentence))) { removed += 1; return false; }
    return true;
  });
  return { text: kept.join('').trim(), removed };
}
