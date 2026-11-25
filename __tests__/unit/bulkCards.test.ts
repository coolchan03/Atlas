/** Flashcards from a long transcript: cut into passages, and only cards the passage supports are kept. */
import { groundedCards, splitForCards } from '../../src/study/bulkCards';

it('cuts at sentence ends into passages of about the size asked for', () => {
  const text = Array.from({ length: 30 }, (_, i) => `Sentence number ${i} says something about the lecture topic.`).join(' ');
  const chunks = splitForCards(text, 300);
  expect(chunks.length).toBeGreaterThan(4);
  for (const c of chunks) { expect(c.length).toBeLessThanOrEqual(360); expect(c.endsWith('.')).toBe(true); }
  expect(chunks.join(' ')).toBe(text);
});

it('keeps a card whose answer is in the passage, and drops made-up, repeated and malformed ones', () => {
  const chunk = 'Mitochondria make most of the cell energy. The process is called cellular respiration and it needs oxygen.';
  const seen = new Set<string>();
  const reply = [
    'Q: What do mitochondria make? | A: Most of the cell energy',
    'Q: What is the capital of France? | A: Paris is the capital city',
    'Q: What does cellular respiration need? | A: Oxygen',
    'Q: What do mitochondria make? | A: Most of the cell energy',
    'not a card at all',
    'Q: Cellular respiration | A: Cellular respiration',
  ].join('\n');
  const kept = groundedCards(reply, chunk, seen);
  expect(kept.map((c) => c.q)).toEqual(['What do mitochondria make?', 'What does cellular respiration need?']);
  // The same question in a later passage is not kept again.
  expect(groundedCards('Q: What do mitochondria make? | A: Most of the cell energy', chunk, seen)).toEqual([]);
});
