import { requireRTL } from '../harness/nativeBoundary';

jest.mock('@react-navigation/native', () => ({ ...jest.requireActual('@react-navigation/native'), useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }), useRoute: () => ({ params: {} }) }));
const mockAsk = jest.fn();
jest.mock('../../src/study/engine', () => ({ askShaped: (...a: unknown[]) => mockAsk(...a) }));

it('seals a letter that cannot be read before its date, then opens it with a look back whose numbers come from the journal pages', async () => {
  const rtl = requireRTL();
  const React = require('react');
  const { TimeCapsuleScreen } = require('../../src/capsule/TimeCapsuleScreen');
  const { useCapsules } = require('../../src/capsule/store');
  const { useJournal, dayKey } = require('../../src/journal/store');
  const view = rtl.render(React.createElement(TimeCapsuleScreen));

  expect(view.getByTestId('capsule-seal').props.accessibilityState?.disabled).toBe(true);
  rtl.fireEvent.changeText(view.getByTestId('capsule-letter'), 'Dear me, I hope you finished the radio.');
  rtl.fireEvent.press(view.getByTestId('capsule-after-12'));
  rtl.fireEvent.press(view.getByTestId('capsule-seal'));
  const [capsule] = useCapsules.getState().capsules;
  expect(capsule.opensAt - capsule.sealedAt).toBeGreaterThan(360 * 86_400_000);
  expect(view.getByTestId(`capsule-shut-${capsule.id}`).props.children).toMatch(/^Shut\. Opens on /);
  expect(view.queryByText(/finished the radio/)).toBeNull(); // the letter is not on screen while shut

  // Time passes: the capsule opened a month ago, with a good and a hard day in between.
  const day = (n: number) => dayKey(new Date(Date.now() - n * 86_400_000));
  rtl.act(() => {
    useCapsules.setState({ capsules: [{ ...capsule, sealedAt: Date.now() - 60 * 86_400_000, opensAt: Date.now() - 86_400_000 }] });
    useJournal.setState({ entries: [
      { day: day(40), text: 'Started the radio.', mood: 5, updatedAt: 1 },
      { day: day(20), text: 'A hard week at work.', mood: 1, updatedAt: 1 },
      { day: day(90), text: 'Before the capsule.', mood: 3, updatedAt: 1 },
    ] });
  });
  expect(view.getByTestId(`capsule-letter-${capsule.id}`).props.children).toMatch(/finished the radio/);
  mockAsk.mockResolvedValueOnce('You began a radio project and then had a hard week.');
  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId(`capsule-lookback-${capsule.id}`)); });
  const text = view.getByTestId(`capsule-summary-${capsule.id}`).props.children;
  expect(text).toMatch(/You wrote 2 journal pages\. Your mood averaged 3 out of 5\./);
  expect(text).toMatch(/You began a radio project/);
  expect(mockAsk.mock.calls[0][1]).not.toMatch(/Before the capsule/);
});
