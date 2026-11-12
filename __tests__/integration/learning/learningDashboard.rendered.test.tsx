/**
 * The learning dashboard with a real database: progress and conflicts, the exam form, and exports.
 * Fakes only the device boundary (storage, the model).
 */
import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';
import { doMockRealSqlite } from '../../harness/sqliteFake';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
  useFocusEffect: (effect: () => void) => require('react').useEffect(effect, [effect]),
}));

const src = (passage: string) => [{ n: 1, title: 'Water manual', kind: 'library', passage }];

function open() {
  installNativeBoundary({ fs: true });
  doMockRealSqlite();
  const rtl = requireRTL();
  const React = require('react');
  const { Alert } = require('react-native');
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  const { learningKnowledgeDb: db } = require('../../../src/learning/knowledgeDb');
  const { ingestClaims } = require('../../../src/learning/claimIngest');
  const { LearningReliabilityScreen } = require('../../../src/screens/LearningReliabilityScreen');
  const seed = (id: string, text: string, passage: string) => ingestClaims(db, { topic: 'water', question: 'Q', reportId: id, reportText: `ANSWER: ${text} [1]`, sources: src(passage), reportStatus: 'candidate', reportNote: '' });
  return { rtl, alert, db, seed, view: () => rtl.render(React.createElement(LearningReliabilityScreen)) };
}

it('shows what was learned, the conflict between two claims, and records that a person resolved it', async () => {
  const { rtl, alert, db, seed, view } = open();
  seed('a', 'Boil the water for one minute.', 'Boil water for one minute.');
  seed('b', 'Boil the water for ten minutes.', 'Boil water for ten minutes.');
  const screen = view();
  expect(await screen.findByText('Two claims disagree')).toBeTruthy();
  expect(screen.getByText(/States different numbers/)).toBeTruthy();
  expect(screen.getByText(/Model weights: unchanged/)).toBeTruthy();
  expect(screen.getByText(/No claim has been verified by you yet/)).toBeTruthy();

  rtl.fireEvent.press(screen.getByLabelText('Mark conflict resolved'));
  const resolve = (alert.mock.calls.at(-1)![2] as any[]).find((b) => b.text === 'Resolved');
  rtl.act(() => resolve.onPress());
  expect(db.openContradictions()).toHaveLength(0);
  await rtl.waitFor(() => expect(screen.queryByText('Two claims disagree')).toBeNull());
});

it('adds exam questions with the facts a right answer must contain, and refuses an empty one', async () => {
  const { rtl, alert, view } = open();
  const { exams } = require('../../../src/learning/engine');
  const screen = view();
  rtl.fireEvent.press(await screen.findByTestId('exam-add'));
  expect(alert).toHaveBeenCalledWith('Needs a question and an answer', expect.any(String));

  rtl.fireEvent.changeText(screen.getByTestId('exam-question'), 'How long should water be boiled?');
  rtl.fireEvent.changeText(screen.getByTestId('exam-facts'), 'one minute | 1 minute\ncool');
  rtl.fireEvent.changeText(screen.getByTestId('exam-forbid'), 'ten minutes');
  rtl.fireEvent.press(screen.getByTestId('exam-add'));
  expect(await screen.findByText('How long should water be boiled?')).toBeTruthy();
  expect(exams.items('__no-agent__')[0].expected).toEqual({ facts: [['one minute', '1 minute'], ['cool']], forbid: ['ten minutes'] });
});

it('saves the verified knowledge and the training data as files, never including the exam', async () => {
  const { rtl, alert, db, seed, view } = open();
  const RNFS = require('react-native-fs');
  const { exams } = require('../../../src/learning/engine');
  seed('a', 'Boil the water for one minute.', 'Boil water for one minute.');
  db.reviewClaim({ id: 'a:claim:1', status: 'verified', actor: 'device-owner-review', reason: 'checked the manual' });
  exams.addItem({ subjectId: '__no-agent__', topic: 'water', question: 'SECRET EXAM QUESTION?', expected: { facts: [['x']] } });
  const screen = view();

  rtl.fireEvent.press(await screen.findByTestId('export-verified'));
  await rtl.waitFor(() => expect(alert).toHaveBeenCalledWith('Saved', expect.stringMatching(/records saved to .*atlas-knowledge-verified-/)));
  const knowledgePath = String(alert.mock.calls.at(-1)![1]).split(' saved to ')[1];
  const knowledge = await RNFS.readFile(knowledgePath, 'utf8');
  expect(knowledge).toContain('Boil the water for one minute');
  expect(knowledge).not.toContain('SECRET EXAM');

  rtl.fireEvent.changeText(screen.getByTestId('export-base-model'), 'qwen3-4b');
  rtl.fireEvent.press(screen.getByTestId('export-training'));
  await rtl.waitFor(() => expect(alert).toHaveBeenCalledWith('Saved', expect.stringMatching(/Atlas has not trained anything/)));
  const dir = String(alert.mock.calls.at(-1)![1]).match(/saved to (.+?)\. Atlas has not/)![1];
  const manifest = JSON.parse(await RNFS.readFile(`${dir}/manifest.json`, 'utf8'));
  expect(manifest).toMatchObject({ baseModel: 'qwen3-4b', counts: { eligible: 1 } });
});
