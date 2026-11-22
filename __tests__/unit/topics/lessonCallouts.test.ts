import { splitCallouts, tint } from '../../../src/topics/lessonCallouts';

describe('callouts in a lesson', () => {
  it('draws a labelled paragraph as a callout and leaves the rest as text', () => {
    const out = splitCallouts('A debit is the left side of an entry.\n\nDefinition: A debit increases an asset account.\n\nIt is easy to mix up the sides.');
    expect(out).toEqual([
      { kind: 'text', text: 'A debit is the left side of an entry.' },
      { kind: 'callout', callout: 'definition', label: 'Definition', text: 'A debit increases an asset account.' },
      { kind: 'text', text: 'It is easy to mix up the sides.' },
    ]);
  });

  it.each([
    ['**Tip:** Check the totals first.', 'tip', 'Check the totals first.'],
    ['> **Warning**: Never divide by zero here.', 'warning', 'Never divide by zero here.'],
    ['Watch out: the sign flips on the right side.', 'warning', 'the sign flips on the right side.'],
    ['Remember: assets equal liabilities plus equity.', 'note', 'assets equal liabilities plus equity.'],
  ])('reads "%s"', (text, kind, body) => {
    const [piece] = splitCallouts(text);
    expect(piece).toMatchObject({ kind: 'callout', callout: kind, text: body });
  });

  it('keeps a table together and leaves a lesson with no labels untouched', () => {
    const table = '| a | b |\n| - | - |\n| 1 | 2 |';
    expect(splitCallouts(`Intro line.\n\n${table}`)).toEqual([{ kind: 'text', text: `Intro line.\n\n${table}` }]);
    expect(splitCallouts('Tip jars are common in cafes.')).toEqual([{ kind: 'text', text: 'Tip jars are common in cafes.' }]);
  });

  it('does not make a callout from a label with almost nothing after it', () => {
    expect(splitCallouts('Note: yes')).toEqual([{ kind: 'text', text: 'Note: yes' }]);
  });
});

describe('tint', () => {
  it('turns #rgb and #rrggbb into a see-through colour and leaves others alone', () => {
    expect(tint('#B3620F', 0.1)).toBe('rgba(179, 98, 15, 0.1)');
    expect(tint('#fff', 0.5)).toBe('rgba(255, 255, 255, 0.5)');
    expect(tint('rgba(1, 2, 3, 1)', 0.5)).toBe('rgba(1, 2, 3, 1)');
  });
});
