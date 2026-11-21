import { enforceForageSafety, hasEdibleClaim, MUSHROOM_WARNING, PLANT_WARNING } from '../../../src/utils/forageSafety';
import { waitForFailures, recordPinFailure, pinWaitRemaining, recordPinSuccess, resetPinThrottleCache } from '../../../src/services/pinThrottle';
import { parseGroundedLearningTerms } from '../../../src/study/engine';
import { skipUnchangedChatWrites } from '../../../src/stores/chatStore';
import { visibleConversations } from '../../../src/atlasTools/chatPrefs';
import { fillUserName } from '../../../src/stores/agentStore';
import { useAppStore } from '../../../src/stores/appStore';

describe('Field ID foraging safety', () => {
  it('rewrites an edible mushroom verdict', () => {
    const out = enforceForageSafety('Verdict: EDIBLE. This mushroom is a chanterelle.');
    expect(out.startsWith(`**${MUSHROOM_WARNING}**`)).toBe(true);
    expect(out).not.toMatch(/Verdict: EDIBLE/);
  });
  it('leaves negated claims alone', () => {
    expect(hasEdibleClaim('This mushroom is not edible and is inedible.')).toBe(false);
    expect(enforceForageSafety('Death cap: never safe to eat.')).toBe('Death cap: never safe to eat.');
  });
  it('adds a lookalike warning to edible plants', () => {
    const out = enforceForageSafety('These berries are edible when ripe.');
    expect(out).toContain(PLANT_WARNING);
  });
});

describe('PIN throttle', () => {
  beforeEach(() => resetPinThrottleCache());
  it('allows 4 free mistakes, then doubles the wait', () => {
    expect(waitForFailures(4)).toBe(0);
    expect(waitForFailures(5)).toBe(30_000);
    expect(waitForFailures(6)).toBe(60_000);
    expect(waitForFailures(30)).toBe(60 * 60_000);
  });
  it('blocks after 5 failures and clears on success', async () => {
    for (let i = 0; i < 5; i++) await recordPinFailure('test', 1_000);
    expect(await pinWaitRemaining('test', 1_000)).toBe(30_000);
    await recordPinSuccess('test');
    expect(await pinWaitRemaining('test', 1_000)).toBe(0);
  });
});

describe('project game terms', () => {
  const sources = [
    { n: 1, doc: 'water.md', part: 1, text: 'Boil water to kill bacteria. Filtration removes sediment.' },
    { n: 2, doc: 'fire.md', part: 1, text: 'Tinder catches a spark first, then kindling.' },
  ];
  it('accepts words that occur in the sources (the old regex rejected all of them)', () => {
    const raw = 'TERM: Bacteria | CLUE: Tiny germs killed by boiling | SRC: 1\n1. TERM: Kindling | CLUE: Small sticks added after the first flame | SRC: 1\n- **TERM: Sediment | CLUE: Dirt that settles to the bottom**';
    const terms = parseGroundedLearningTerms(raw, sources as any);
    expect(terms.map(t => t.answer)).toEqual(['BACTERIA', 'KINDLING', 'SEDIMENT']);
    // Wrong SRC is corrected to the passage that really has the word.
    expect(terms[1].src).toEqual([2]);
  });
  it('rejects invented words and clues that give away the answer', () => {
    const raw = 'TERM: Unicorn | CLUE: A made up horse animal | SRC: 1\nTERM: Tinder | CLUE: Tinder is what catches | SRC: 2';
    expect(parseGroundedLearningTerms(raw, sources as any)).toHaveLength(0);
  });
});

describe('chat persistence', () => {
  it('skips writes when saved chats did not change (streamed tokens)', async () => {
    const inner = { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() };
    const storage = skipUnchangedChatWrites(inner as any);
    const conv = { id: 'a', messages: [] } as any;
    await storage.setItem('k', { state: { conversations: [conv], activeConversationId: 'a' }, version: 0 });
    await storage.setItem('k', { state: { conversations: [conv], activeConversationId: 'a' }, version: 0 });
    expect(inner.setItem).toHaveBeenCalledTimes(1);
    await storage.setItem('k', { state: { conversations: [{ ...conv, messages: [{}] }], activeConversationId: 'a' }, version: 0 });
    expect(inner.setItem).toHaveBeenCalledTimes(2);
  });
  it('hides locked chats until the vault is open', () => {
    const list = [{ id: 'a' }, { id: 'b', pinVerifier: 'pin:v1:x' }];
    expect(visibleConversations(list, true, false).map(c => c.id)).toEqual(['a']);
    expect(visibleConversations(list, true, true)).toHaveLength(2);
    expect(visibleConversations(list, false, false)).toHaveLength(2);
  });
});

describe('agent prompts', () => {
  it('fills the user name from settings', () => {
    useAppStore.getState().updateSettings({ userName: 'Sam' } as any);
    expect(fillUserName('Hi {{name}}!')).toBe('Hi Sam!');
    useAppStore.getState().updateSettings({ userName: '' } as any);
    expect(fillUserName('Hi {{name}}!')).toBe('Hi the user!');
  });
});
