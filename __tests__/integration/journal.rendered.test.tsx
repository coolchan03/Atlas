import { requireRTL } from '../harness/nativeBoundary';

jest.mock('@react-navigation/native', () => ({ ...jest.requireActual('@react-navigation/native'), useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }), useRoute: () => ({ params: {} }) }));
const mockAsk = jest.fn();
jest.mock('../../src/study/engine', () => ({ askShaped: (...a: unknown[]) => mockAsk(...a) }));

it('writes a page for today with a mood, keeps it, shows the streak, opens an earlier page, and looks back on the week with the phone\'s own AI', async () => {
  const rtl = requireRTL();
  const React = require('react');
  const { JournalScreen } = require('../../src/journal/JournalScreen');
  const { useJournal, dayKey } = require('../../src/journal/store');
  const ago = (n: number) => dayKey(new Date(Date.now() - n * 86_400_000));
  useJournal.setState({ entries: [
    { day: ago(1), text: 'Yesterday I finished the report.', mood: 4, updatedAt: 1 },
    { day: ago(2), text: 'A slow day with a long walk.', mood: 3, updatedAt: 1 },
  ] });

  const view = rtl.render(React.createElement(JournalScreen));
  expect(view.getByTestId('journal-day').props.children.join('')).toMatch(/TODAY/);
  const first = view.getByTestId('journal-prompt').props.children;
  rtl.fireEvent.press(view.getByTestId('journal-prompt'));
  expect(view.getByTestId('journal-prompt').props.children).not.toBe(first); // another question

  expect(view.getByTestId('journal-save').props.accessibilityState?.disabled).toBe(true);
  rtl.fireEvent.changeText(view.getByTestId('journal-text'), 'Today I started the radio.');
  rtl.fireEvent.press(view.getByTestId('journal-mood-5'));
  rtl.fireEvent.press(view.getByTestId('journal-save'));
  expect(useJournal.getState().entries[0]).toMatchObject({ day: ago(0), text: 'Today I started the radio.', mood: 5 });
  expect(view.getByTestId('journal-day').props.children.join('')).toMatch(/3 DAYS IN A ROW/);

  // An earlier page opens, can be edited and goes back to today.
  rtl.fireEvent.press(view.getByTestId(`journal-page-${ago(1)}`));
  expect(view.getByTestId('journal-text').props.value).toBe('Yesterday I finished the report.');
  rtl.fireEvent.press(view.getByTestId('journal-today'));
  expect(view.getByTestId('journal-text').props.value).toBe('Today I started the radio.');

  // The week in review: the AI reads only the pages, and its answer is shown.
  mockAsk.mockResolvedValueOnce('A steady week: a finished report and a started radio. Maybe rest more.');
  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId('journal-review')); });
  const [system, user, shape] = mockAsk.mock.calls[0];
  expect(system).toMatch(/Do not invent events/);
  expect(user).toMatch(/Yesterday I finished the report\./);
  expect(user).toMatch(/\(mood: Great\): Today I started the radio\./);
  expect(shape.maxTokens).toBeGreaterThan(100);
  expect(view.getByTestId('journal-summary').props.children).toMatch(/A steady week/);

  // Deleting today's page empties it.
  rtl.fireEvent.press(view.getByTestId('journal-delete'));
  expect(useJournal.getState().entries.some((e: { day: string }) => e.day === ago(0))).toBe(false);
  expect(view.getByTestId('journal-text').props.value).toBe('');
});
