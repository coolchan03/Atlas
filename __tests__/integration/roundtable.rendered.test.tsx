/** Roundtable: roles take turns and the person joins in where the format asks. Fakes only the AI. */
import { installNativeBoundary, requireRTL } from '../harness/nativeBoundary';

let mockHold: Promise<void> | null = null;
jest.mock('../../src/atlasTools/models', () => ({ ensureTextModel: async () => undefined }));
jest.mock('../../src/services/llmJobQueue', () => ({ runBackgroundJob: (fn: () => Promise<unknown>) => fn() }));
jest.mock('../../src/services/llm', () => ({
  llmService: {
    getPerformanceSettings: () => ({ contextLength: 4096 }),
    getPerformanceStats: () => ({ lastTokensPerSecond: 0, lastTimeToFirstToken: 0, lastTokenCount: 0 }),
    generateResponse: async (msgs: { content: string }[]) => {
      const system = msgs[0].content; const user = msgs[1].content;
      if (mockHold) await mockHold;
      if (/You are Judge/.test(system)) return 'Verdict: Pro. The cost argument was better supported.';
      if (/You are Pro/.test(system)) return 'Pro: Cars crowd out people, and the data shows it.';
      if (/You are Con/.test(system)) return 'Con: Shops lose customers who drive in.';
      if (/You are Referee/.test(system)) return 'PLACE: cellar. CARRYING: lamp.';
      if (/You are Narrator/.test(system)) return /Set the scene/.test(user) ? 'You stand at a small door. What do you do?' : 'The door opens onto a cellar. What now?';
      return 'ok';
    },
  },
}));
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
}));

const mount = () => {
  installNativeBoundary({ fs: true });
  const rtl = requireRTL();
  const React = require('react');
  const { RoundtableScreen } = require('../../src/roundtable/RoundtableScreen');
  return { rtl, view: rtl.render(React.createElement(RoundtableScreen)) };
};

it('a debate runs side against side and ends with the judge\'s verdict', async () => {
  const { rtl, view } = mount();
  rtl.fireEvent.press(view.getByTestId('roundtable-format-debate'));
  expect(view.getByTestId('roundtable-blurb').props.children).toMatch(/judge scores the evidence/);
  rtl.fireEvent.press(view.getByTestId('roundtable-rounds-down'));
  rtl.fireEvent.press(view.getByTestId('roundtable-rounds-down'));
  rtl.fireEvent.press(view.getByTestId('roundtable-rounds-down'));
  expect(view.getByTestId('roundtable-rounds').props.children).toBe(1);
  rtl.fireEvent.press(view.getByTestId('roundtable-start')); // no topic yet: nothing starts
  expect(view.queryByTestId('roundtable-run')).toBeNull();
  rtl.fireEvent.changeText(view.getByTestId('roundtable-topic'), 'Should cities ban cars downtown?');
  rtl.fireEvent.press(view.getByTestId('roundtable-start'));
  await rtl.waitFor(() => expect(view.getByText(/Verdict: Pro/)).toBeTruthy(), { timeout: 8000 });
  expect(view.getAllByText(/Cars crowd out people/)).toHaveLength(2); // opening and closing, with the "Pro:" prefix the model added stripped
  expect(view.getAllByText(/Shops lose customers/)).toHaveLength(2);
  expect(view.getByTestId('roundtable-progress').props.children.join('')).toMatch(/5 of 5 steps · finished/);

  // A finished debate becomes an episode in the podcast player: one voice per side, the judge a third.
  rtl.fireEvent.press(view.getByTestId('roundtable-episode'));
  expect(mockNavigate).toHaveBeenCalledWith('Study', expect.objectContaining({ projectId: expect.stringMatching(/^roundtable:/) }));
  const { useStudyStore } = require('../../src/study/store');
  const [episode] = Object.values(useStudyStore.getState().saved)[0] as { podcast: { host: string; text: string }[]; hosts: number }[];
  expect(episode.podcast.map((l) => l.host)).toEqual(['A', 'B', 'A', 'B', 'C']);
  expect(episode.hosts).toBe(3);
}, 30000);

it('a game waits for you, then carries on from what you did', async () => {
  const { rtl, view } = mount();
  rtl.fireEvent.press(view.getByTestId('roundtable-format-game'));
  rtl.fireEvent.changeText(view.getByTestId('roundtable-topic'), 'A lighthouse keeper finds a door');
  rtl.fireEvent.press(view.getByTestId('roundtable-start'));
  await rtl.waitFor(() => expect(view.getByTestId('roundtable-player')).toBeTruthy(), { timeout: 8000 });
  expect(view.getByText(/You stand at a small door/)).toBeTruthy();
  rtl.fireEvent.changeText(view.getByTestId('roundtable-reply'), 'I open the door');
  rtl.fireEvent.press(view.getByTestId('roundtable-send'));
  await rtl.waitFor(() => expect(view.getByText(/The door opens onto a cellar/)).toBeTruthy(), { timeout: 8000 });
  expect(view.getByText('I open the door')).toBeTruthy(); // your own turn is in the transcript
  expect(view.queryByText(/PLACE: cellar/)).toBeNull(); // the referee's notes stay hidden
}, 30000);

it('leaving while a turn is being written does not bring the old session back when that turn finishes', async () => {
  const { rtl, view } = mount();
  let release: () => void = () => undefined;
  mockHold = new Promise<void>((r) => { release = r; });
  rtl.fireEvent.changeText(view.getByTestId('roundtable-topic'), 'Should cities ban cars downtown?');
  rtl.fireEvent.press(view.getByTestId('roundtable-start'));
  await rtl.waitFor(() => expect(view.getByTestId('roundtable-speaking')).toBeTruthy());
  rtl.fireEvent.press(view.getByLabelText('Back'));
  expect(view.getByTestId('roundtable-setup')).toBeTruthy();
  await rtl.act(async () => { release(); mockHold = null; await new Promise((r) => setTimeout(r, 100)); });
  expect(view.queryByTestId('roundtable-run')).toBeNull(); // still on the setup screen
  expect(view.getByTestId('roundtable-setup')).toBeTruthy();
}, 30000);
