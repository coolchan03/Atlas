import { MAX_QUESTIONS, normalizeQuestionsReport } from '../../../src/learning/questionImport';

const lineFor = (n: number) => `Q${n}. What is item ${n}? Answer: ${n}`;
const reply = (items: number[]) => JSON.stringify({ questions: items.map((n) => ({ question: `What is item ${n}?`, answer: String(n) })) });

describe('UX-08 question imports are not silently cut at 100', () => {
  it('reads a 1,000 question bank completely', async () => {
    const text = Array.from({ length: 1000 }, (_, i) => lineFor(i + 1)).join('\n');
    const ask = async (_s: string, piece: string) => reply([...piece.matchAll(/^Q(\d+)\./gm)].map((m) => Number(m[1])));
    const r = await normalizeQuestionsReport(text, ask);
    expect(r.questions).toHaveLength(1000);
    expect(r.capped).toBe(false);
    expect(r.piecesRead).toBe(r.pieces);
  });
  it('says so when the safety limit stops it, with how much was read', async () => {
    const text = Array.from({ length: MAX_QUESTIONS + 500 }, (_, i) => lineFor(i + 1)).join('\n');
    const ask = async (_s: string, piece: string) => reply([...piece.matchAll(/^Q(\d+)\./gm)].map((m) => Number(m[1])));
    const r = await normalizeQuestionsReport(text, ask);
    expect(r.questions.length).toBeLessThanOrEqual(MAX_QUESTIONS);
    expect(r.capped).toBe(true);
    expect(r.piecesRead).toBeLessThan(r.pieces);
  });
});
