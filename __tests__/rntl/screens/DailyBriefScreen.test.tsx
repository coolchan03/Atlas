import React from 'react';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';

let mockResolve: ((r: any) => void) | null = null;
let mockStep: ((m: string) => void) | null = null;
jest.mock('../../../src/atlasTools/dailyBrief', () => ({
  ...jest.requireActual('../../../src/atlasTools/dailyBrief'),
  makeBriefing: jest.fn((onStep: (m: string) => void) => new Promise((resolve) => { mockStep = onStep; mockResolve = resolve; })),
}));
jest.mock('../../../src/atlasVoice/tts', () => ({ listVoices: jest.fn(async () => []), keepScreenOn: jest.fn() }));

import { DailyBriefScreen } from '../../../src/screens/DailyBriefScreen';
import { useStudyStore } from '../../../src/study/engine';
import { BRIEF_PROJECT, makeBriefing } from '../../../src/atlasTools/dailyBrief';

const renderScreen = () => render(<NavigationContainer><DailyBriefScreen /></NavigationContainer>);

beforeEach(() => { useStudyStore.setState({ saved: {} }); mockResolve = null; mockStep = null; });

it('shows step-by-step progress while the briefing is being made', async () => {
  const screen = renderScreen();
  fireEvent.press(screen.getByTestId('brief-make'));
  await waitFor(() => expect(screen.getByTestId('brief-progress')).toBeTruthy());
  act(() => { mockStep!('Checking news: United States...'); });
  act(() => { mockStep!('Reading story 1 of 3: Senate passes funding bill...'); });
  expect(screen.getByText('Reading story 1 of 3: Senate passes funding bill...')).toBeTruthy();
  expect(screen.getByText('Checking news: United States...')).toBeTruthy(); // finished step stays listed
  expect(screen.queryByTestId('brief-make')).toBeNull();
  await act(async () => { mockResolve!({ createdAt: 1, title: 'x', kind: 'podcast', topic: '', sources: [] }); });
  await waitFor(() => expect(screen.queryByTestId('brief-progress')).toBeNull());
});

it("lists the real headlines today's briefing was made from", () => {
  useStudyStore.setState({ saved: { [BRIEF_PROJECT]: [{
    kind: 'podcast', createdAt: Date.now(), topic: '', title: 'Daily briefing - Monday', sources: [],
    headlines: [{ title: 'Senate passes funding bill', source: 'Reuters', interest: 'United States', url: 'https://reuters.com/x' }],
  }] } } as any);
  const screen = renderScreen();
  expect(screen.getByTestId('brief-headlines')).toBeTruthy();
  expect(screen.getByText('Senate passes funding bill')).toBeTruthy();
  expect(screen.getByText(/Reuters · United States/)).toBeTruthy();
  expect(screen.getByTestId('brief-listen')).toBeTruthy();
});

it('shows a failure in place instead of a blocking alert', async () => {
  (makeBriefing as jest.Mock).mockRejectedValueOnce(new Error('Could not reach the news'));
  const screen = renderScreen();
  await act(async () => { fireEvent.press(screen.getByTestId('brief-make')); });
  await waitFor(() => expect(screen.getByText('Could not reach the news')).toBeTruthy());
});

it('adds topics to avoid, and deletes an earlier briefing from the options that holding it opens (holding alone deletes nothing)', () => {
  const { useBriefPrefs } = require('../../../src/atlasTools/dailyBrief');
  const { Alert } = require('react-native');
  useBriefPrefs.setState({ avoid: [] });
  useStudyStore.setState({ saved: { [BRIEF_PROJECT]: [{ kind: 'podcast', createdAt: 5, topic: '', title: 'Old briefing', sources: [] }] } } as any);
  const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t: any, _m: any, buttons: any) => buttons?.[1]?.onPress?.());
  const screen = renderScreen();
  fireEvent.changeText(screen.getByTestId('brief-avoid-input'), 'sports and celebrity gossip');
  fireEvent.press(screen.getByTestId('brief-avoid-add'));
  expect(useBriefPrefs.getState().avoid).toEqual(['sports', 'celebrity gossip']);
  fireEvent(screen.getByTestId('brief-5'), 'longPress');
  expect(alert).not.toHaveBeenCalled();
  expect(useStudyStore.getState().saved[BRIEF_PROJECT]).toHaveLength(1);
  fireEvent.press(screen.getByTestId('sheet-action-delete'));
  expect(alert).toHaveBeenCalledWith('Delete this briefing?', 'Old briefing', expect.any(Array)); // still asks before deleting
  expect(useStudyStore.getState().saved[BRIEF_PROJECT]).toEqual([]);
  alert.mockRestore();
});

it('offers one-tap kinds of story to leave out, and hides the ones already chosen', () => {
  const { useBriefPrefs } = require('../../../src/atlasTools/dailyBrief');
  useBriefPrefs.setState({ avoid: [] });
  const screen = renderScreen();
  fireEvent.press(screen.getByTestId('brief-avoid-sports'));
  expect(useBriefPrefs.getState().avoid).toEqual(['Sports']);
  expect(screen.queryByTestId('brief-avoid-sports')).toBeNull();
  fireEvent.press(screen.getByTestId('brief-avoid-celebrity-gossip'));
  expect(useBriefPrefs.getState().avoid).toEqual(['Sports', 'Celebrity gossip']);
});

it('offers to avoid the kind of story, or stop following its interest, from a story of the finished briefing', () => {
  const { useBriefPrefs } = require('../../../src/atlasTools/dailyBrief');
  useBriefPrefs.setState({ avoid: [], interests: ['United States', 'technology'] });
  useStudyStore.setState({ saved: { [BRIEF_PROJECT]: [{
    kind: 'podcast', createdAt: Date.now(), topic: '', title: 'Daily briefing - Monday', sources: [],
    headlines: [
      { title: 'Bears beat Packers in overtime thriller', source: 'ESPN', interest: 'United States' },
      { title: 'Senate passes funding bill', source: 'Reuters', interest: 'United States' },
      { title: 'New battery doubles phone life', source: 'Wired', interest: 'technology' },
    ],
  }] } } as any);
  const screen = renderScreen();

  // A sports story: avoid Sports, and it leaves the list.
  fireEvent.press(screen.getByTestId('brief-notforme-0'));
  fireEvent.press(screen.getByTestId('brief-story-avoid-sports'));
  expect(useBriefPrefs.getState().avoid).toEqual(['Sports']);
  expect(screen.queryByText('Bears beat Packers in overtime thriller')).toBeNull();

  // The senate story is now first: Sports is already avoided so it is not offered again; the other kinds are.
  fireEvent.press(screen.getByTestId('brief-notforme-0'));
  expect(screen.queryByTestId('brief-story-avoid-sports')).toBeNull();
  expect(screen.getByTestId('brief-story-avoid-politics')).toBeTruthy();
  fireEvent.press(screen.getByTestId('brief-story-unfollow'));
  expect(useBriefPrefs.getState().interests).toEqual(['technology']);

  // Just hiding changes nothing else (the battery story is first now).
  fireEvent.press(screen.getByTestId('brief-notforme-0'));
  fireEvent.press(screen.getByTestId('brief-story-hide'));
  expect(screen.queryByText('New battery doubles phone life')).toBeNull();
  expect(useBriefPrefs.getState().avoid).toEqual(['Sports']);
});

describe('Preview a fun fact (rendered)', () => {
  const { Alert } = require('react-native');
  const { useBriefPrefs } = require('../../../src/atlasTools/dailyBrief');
  const funFact = require('../../../src/atlasTools/dailyBrief');

  beforeEach(() => {
    useBriefPrefs.setState({ funFacts: true, interests: ['sea life'] });
    jest.restoreAllMocks();
  });

  it('shows the fact and the page it came from', async () => {
    jest.spyOn(funFact, 'funFactAttempt').mockResolvedValue({ kind: 'found', fact: { topic: 'sea life', page: 'Wikipedia: Octopus', text: 'The octopus has three hearts.' } });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const screen = renderScreen();
    await act(async () => { fireEvent.press(screen.getByTestId('brief-fact-preview')); });
    await waitFor(() => expect(alert).toHaveBeenCalled());
    expect(alert.mock.calls[0][0]).toBe('A fun fact about sea life');
    expect(alert.mock.calls[0][1]).toMatch(/From Wikipedia: Octopus[\s\S]*three hearts/);
  });

  it.each([
    ['off-grid', /Off-grid mode is on/],
    ['offline', /could not reach Wikipedia/],
    ['nothing-suitable', /none was a suitable article/],
  ] as const)('says the real reason when nothing comes back (%s)', async (why, message) => {
    jest.spyOn(funFact, 'funFactAttempt').mockResolvedValue({ kind: 'none', why, tried: ['sea life'] });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const screen = renderScreen();
    await act(async () => { fireEvent.press(screen.getByTestId('brief-fact-preview')); });
    await waitFor(() => expect(alert).toHaveBeenCalled());
    expect(alert.mock.calls[0][0]).toBe('No fun fact found');
    expect(alert.mock.calls[0][1]).toMatch(message);
  });

  it('a lookup that throws is reported as a connection problem, not as "nothing found" and not as a crash', async () => {
    jest.spyOn(funFact, 'funFactAttempt').mockRejectedValue(new Error('boom'));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const screen = renderScreen();
    await act(async () => { fireEvent.press(screen.getByTestId('brief-fact-preview')); });
    await waitFor(() => expect(alert).toHaveBeenCalled());
    expect(alert.mock.calls[0][1]).toMatch(/could not reach Wikipedia/);
  });

  it('the button is not shown without interests, or with fun facts switched off', () => {
    useBriefPrefs.setState({ interests: [] });
    expect(renderScreen().queryByTestId('brief-fact-preview')).toBeNull();
    useBriefPrefs.setState({ interests: ['sea life'], funFacts: false });
    expect(renderScreen().queryByTestId('brief-fact-preview')).toBeNull();
  });

  it('is disabled while looking, so a second press cannot start a second lookup', async () => {
    let finish: (r: unknown) => void = (_r) => undefined;
    const attempt = jest.spyOn(funFact, 'funFactAttempt').mockImplementation(() => new Promise((resolve) => { finish = resolve as (r: unknown) => void; }));
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const screen = renderScreen();
    await act(async () => { fireEvent.press(screen.getByTestId('brief-fact-preview')); });
    expect(screen.getByText('Looking...')).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByTestId('brief-fact-preview')); });
    expect(attempt).toHaveBeenCalledTimes(1);
    await act(async () => { finish({ kind: 'none', why: 'nothing-suitable', tried: [] }); });
  });
});
