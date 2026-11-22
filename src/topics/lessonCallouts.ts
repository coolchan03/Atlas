/**
 * Callouts in a lesson. The AI is asked to start a paragraph with "Definition:", "Tip:", "Warning:" or "Note:" where one of those is
 * what the paragraph is; the app draws that paragraph as a tinted box with an icon. A paragraph that does not start that way is
 * ordinary text, so a lesson from a model that ignores the request, or one saved before this existed, reads exactly as it did. Pure.
 */
export type CalloutKind = 'definition' | 'tip' | 'warning' | 'note';
export type LessonPiece = { kind: 'text'; text: string } | { kind: 'callout'; callout: CalloutKind; label: string; text: string };

const LABELS: Record<string, CalloutKind> = {
  definition: 'definition', 'key term': 'definition', tip: 'tip', shortcut: 'tip',
  warning: 'warning', careful: 'warning', 'watch out': 'warning', caution: 'warning',
  note: 'note', remember: 'note',
};
const LABEL_NAMES: Record<CalloutKind, string> = { definition: 'Definition', tip: 'Tip', warning: 'Warning', note: 'Note' };

// An optional quote mark or bold around the label: "> **Tip:** ...", "**Tip**: ...", "Tip: ..."
const START = /^(?:>\s*)?(?:\*\*|__)?\s*(definition|key term|tip|shortcut|warning|careful|watch out|caution|note|remember)\s*(?::\s*(?:\*\*|__)?|(?:\*\*|__)\s*:)\s*([\s\S]+)$/i;

/** The lesson text cut into ordinary text and callouts, in order. Consecutive ordinary paragraphs stay together (a table keeps its rows). */
export function splitCallouts(text: string): LessonPiece[] {
  const pieces: LessonPiece[] = [];
  const plain: string[] = [];
  const flush = () => { if (plain.length) { pieces.push({ kind: 'text', text: plain.join('\n\n') }); plain.length = 0; } };
  for (const block of text.replace(/\r/g, '').split(/\n\s*\n/)) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    const m = START.exec(trimmed);
    const callout = m ? LABELS[m[1].toLowerCase()] : undefined;
    if (m && callout && m[2].trim().length >= 8) {
      flush();
      pieces.push({ kind: 'callout', callout, label: LABEL_NAMES[callout], text: m[2].replace(/^>\s?/gm, '').trim() });
    } else plain.push(trimmed);
  }
  flush();
  return pieces;
}

/** A colour with some transparency, for the tinted background of a box. Colours that are not #rgb or #rrggbb come back as they were. */
export function tint(color: string, alpha: number): string {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color)?.[1];
  if (!hex) return color;
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
