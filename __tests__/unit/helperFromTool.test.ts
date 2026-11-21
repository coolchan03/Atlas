import { saveHelperFromTool } from '../../src/workflows/helperFromTool';
import { useCustomHelpers } from '../../src/workflows/customHelpers';
import { workflowList } from '../../src/workflows/service';

beforeEach(() => useCustomHelpers.setState({ helpers: [] }));

it('saves a helper the chat AI made, marked as its own, and refuses a bad one', () => {
  const said = saveHelperFromTool({ title: 'Reply writer', steps: 'field: Tone | Friendly, Formal\nai: Write the reply in that tone.', summary: 'Writes replies' });
  expect(said).toMatch(/Saved "Reply writer"/);
  const [h] = useCustomHelpers.getState().helpers;
  expect(h).toMatchObject({ title: 'Reply writer', madeByAi: true });
  expect(workflowList().some((w) => w.title === 'Reply writer (made by the AI)')).toBe(true);
  expect(() => saveHelperFromTool({ title: 'Bad', steps: 'just do something' })).toThrow(/not saved/);
  expect(() => saveHelperFromTool({ title: '', steps: 'ai: x' })).toThrow(/title/);
  expect(() => saveHelperFromTool({ title: 'Long', steps: Array.from({ length: 9 }, () => 'ai: step').join('\n') })).toThrow(/at most 8/);
});

it('stops at ten helpers made by the AI', () => {
  for (let i = 0; i < 10; i++) saveHelperFromTool({ title: `H${i}`, steps: 'ai: do it' });
  expect(() => saveHelperFromTool({ title: 'One more', steps: 'ai: do it' })).toThrow(/already 10/);
});

it('saving the same title again replaces the AI\'s copy, and a full list is never pushed over', () => {
  saveHelperFromTool({ title: 'Reply writer', steps: 'ai: v1' });
  saveHelperFromTool({ title: 'reply writer', steps: 'ai: v2' });
  expect(useCustomHelpers.getState().helpers).toHaveLength(1);
  expect(useCustomHelpers.getState().helpers[0].steps).toBe('ai: v2');
  useCustomHelpers.setState({ helpers: Array.from({ length: 30 }, (_, i) => ({ id: `own${i}`, title: `Mine ${i}`, summary: '', help: '', steps: 'ai: x', createdAt: i })) });
  expect(() => saveHelperFromTool({ title: 'New', steps: 'ai: y' })).toThrow(/full \(30\)/);
  expect(useCustomHelpers.getState().helpers).toHaveLength(30);
});
