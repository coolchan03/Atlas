/**
 * Takes the teasers out of a written briefing. Small models close a story with "next we will see what else is making headlines this
 * morning", promise to "elaborate" on it, or say you can "watch a video after the briefing": none of that is in the sources and none of
 * it happens. A sentence like that is removed; a line left empty is dropped, and the story starts that point at lines move with it. Pure.
 */
const TEASERS: RegExp[] = [
  /\bwhat else is (making|in|on) (the )?(headlines?|news)\b/i,
  /\b(next|up next|coming up|still to come|later)\b[^.!?]{0,60}\b(we('|’)ll|we will|i('|’)ll|i will|let('|’)s)\b[^.!?]{0,40}\b(see|look|hear|take a look|turn to|cover|explore)\b/i,
  /\b(stay tuned|more (to come|after the break)|don('|’)t go anywhere)\b/i,
  /\b(you can|you could|you('|’)ll be able to|feel free to|be sure to)\b[^.!?]{0,40}\b(watch|see|check out|find|read)\b[^.!?]{0,40}\b(video|footage|clip|link|article|full story|after the (briefing|news|show|broadcast))\b/i,
  /\b(we('|’)ll|we will|i('|’)ll|i will|let me|i can)\b[^.!?]{0,30}\b(elaborate|dig deeper|go deeper|tell you more|have more|come back to|get into more|expand on)\b/i,
  /\bmore (details|on this|on that|information) (later|to come|soon|shortly|below)\b/i,
];

// A sentence ends at . ! or ? followed by a space, so 2.5 and U.S. stay whole.
const sentences = (text: string): string[] => text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);

/** A line with its teaser sentences removed ('' when nothing is left). */
export function withoutTeasers(text: string): string {
  const all = sentences(text);
  const kept = all.filter((s) => !TEASERS.some((t) => t.test(s)));
  return kept.length === all.length ? text.trim() : kept.join(' ').trim();
}

export function scrubTeasers<L extends { text: string }>(lines: L[], starts: number[] = []): { lines: L[]; starts: number[]; keptStarts: number[]; removed: number } {
  const kept: L[] = [];
  const newIndex: number[] = []; // for each old line, the index of the first kept line at or after it
  const pending: number[] = [];
  let removed = 0;
  lines.forEach((l, i) => {
    const text = withoutTeasers(l.text);
    if (text !== l.text.trim()) removed += 1;
    if (!text) { pending.push(i); return; }
    pending.forEach((p) => { newIndex[p] = kept.length; });
    pending.length = 0;
    newIndex[i] = kept.length;
    kept.push({ ...l, text });
  });
  pending.forEach((p) => { newIndex[p] = kept.length; });
  const mapped = starts.map((s) => Math.min(newIndex[s] ?? s, Math.max(0, kept.length - 1)));
  // Two stories that now begin on the same line are one: keepStarts says which of the original starts survive (for parallel arrays).
  const keptStarts = mapped.map((m, i) => i).filter((i) => mapped.indexOf(mapped[i]) === i);
  return { lines: kept, starts: keptStarts.map((i) => mapped[i]), keptStarts, removed };
}
