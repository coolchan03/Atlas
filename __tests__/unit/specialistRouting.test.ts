import { noteRouted, routedForTurn, routeSpecialists } from '../../src/services/tools/specialistRouting';

describe('UX-03 specialist routing only where the specialist is better', () => {
  const on = ['read_url'];
  it.each(['What is 1,248 * 37?', 'Work out 15% of 240', 'what is 2750 divided by 12', 'Add 1250.75 + 340.2 for me'])('routes the exact calculator for %s', (t) => expect(routeSpecialists(t, on)).toEqual(['calculator']));
  it.each(['What is 2 + 2?', 'Tell me about the French Revolution', 'I need 3 eggs', 'Write a poem about 100 years', 'Explain what a percent is'])('leaves %s to the regular AI', (t) => expect(routeSpecialists(t, on)).toEqual([]));
  it('never overrides the person\'s tools: nothing in a chat without tools, nothing when the calculator is already on', () => {
    expect(routeSpecialists('What is 1,248 * 37?', [])).toEqual([]);
    expect(routeSpecialists('What is 1,248 * 37?', ['calculator'])).toEqual([]);
  });
  it('is remembered for the latest turn only, so the chat context can show it', () => {
    noteRouted('c1', ['calculator']); expect(routedForTurn('c1')).toEqual(['calculator']);
    noteRouted('c1', []); expect(routedForTurn('c1')).toEqual([]);
  });
});
