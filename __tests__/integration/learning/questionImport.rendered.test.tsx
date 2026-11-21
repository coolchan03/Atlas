/**
 * Bring your own questions: a pasted test in a messy layout is read by the AI (scripted here) into standard questions,
 * the person reviews and removes one, chooses where they go, and they land in the exam and the study questions with a
 * working answer key. Real database; only the AI and storage are faked.
 */
import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';
import { doMockRealSqlite } from '../../harness/sqliteFake';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
  useFocusEffect: (effect: () => void) => require('react').useEffect(effect, [effect]),
}));
const mockReply = jest.fn();
jest.mock('../../../src/study/engine', () => ({ askModel: (...args: unknown[]) => mockReply(...args) }));

const PAPER = `1. What is the boiling point of water at sea level?
Answer: 100 C
2. Which is a noble gas? a) Oxygen b) Neon c) Iron
Answer: b
3. Name the capital of France
Answer: Paris
4. Who wrote it? (no answer given)`;

const REPLY = JSON.stringify({ questions: [
  { question: 'What is the boiling point of water at sea level?', answer: '100 C', alternatives: ['100 degrees Celsius', '212 F'] },
  { question: 'Which is a noble gas?', answer: 'b', options: ['Oxygen', 'Neon', 'Iron'] },
  { question: 'Name the capital of France', answer: 'Paris' },
  { question: 'Which is a metal?', answer: 'Z', options: ['Iron', 'Neon'] }, // an answer that is not one of the options is dropped
] });

it('reads a messy test into questions, lets the person drop one, and adds them where chosen with a working answer key', async () => {
  installNativeBoundary({ fs: true });
  doMockRealSqlite();
  mockReply.mockResolvedValue(REPLY);
  const rtl = requireRTL();
  const React = require('react');
  const { Alert } = require('react-native');
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  const { QuestionImport } = require('../../../src/screens/learningReliability/QuestionImport');
  const { exams } = require('../../../src/learning/engine');
  const { scoreAnswer } = require('../../../src/learning/exams');
  const { useLearningStore, blankState } = require('../../../src/learning/store');
  const { NO_AGENT } = require('../../../src/learning/agents');
  useLearningStore.setState({ experts: [], config: {}, state: { [NO_AGENT]: { ...blankState(), round: 1, bank: [{ id: 'b0', q: 'Name the capital of France', status: 'approved', tries: 0 }] } } });

  const added = jest.fn();
  const view = rtl.render(React.createElement(QuestionImport, { subjectId: NO_AGENT, onAdded: added }));
  rtl.fireEvent.changeText(view.getByTestId('import-source'), PAPER);
  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId('import-read')); });
  expect(await view.findByTestId('import-review')).toBeTruthy();
  expect(view.getByText('3 questions found')).toBeTruthy(); // the one with an answer that is not an option was dropped
  expect(view.getByText(/Choices: Oxygen \/ Neon \/ Iron\. Answer: Neon/)).toBeTruthy(); // "b" became the option's own words

  rtl.fireEvent.press(view.getByLabelText('Remove Which is a noble gas?'));
  expect(view.getByText('2 questions found')).toBeTruthy();

  rtl.fireEvent.press(view.getByTestId('import-target-exam'));
  rtl.fireEvent.press(view.getByTestId('import-add'));
  expect(alert).toHaveBeenCalledWith('Added', '0 to study, 1 to the exam, 1 skipped because they were already there.'); // France was already a study question
  expect(added).toHaveBeenCalled();
  const items = exams.items(NO_AGENT);
  expect(items.map((i: { question: string }) => i.question)).toEqual(['What is the boiling point of water at sea level?']);
  // The answer key works: the answer as written, and the other wordings the AI gave.
  const key = items[0].expected;
  expect(scoreAnswer('It boils at 100 C.', key).correct).toBe(true);
  expect(scoreAnswer('About 212 F', key).correct).toBe(true);
  expect(scoreAnswer('It boils at 90 C', key).correct).toBe(false);
});

it('split keeps every fourth question back for the exam, and study questions go into the learner bank', async () => {
  installNativeBoundary({ fs: true });
  doMockRealSqlite();
  const { addImportedQuestions } = require('../../../src/learning/importService');
  const { exams } = require('../../../src/learning/engine');
  const { useLearningStore, blankState } = require('../../../src/learning/store');
  const { NO_AGENT } = require('../../../src/learning/agents');
  useLearningStore.setState({ experts: [], config: {}, state: { [NO_AGENT]: { ...blankState(), round: 2 } } });
  const asked = ['How many legs does a spider have?', 'Which planet is closest to the sun?', 'What gas do plants absorb from the air?', 'Who painted the Mona Lisa?', 'What is the largest ocean on Earth?', 'How many minutes are in two hours?', 'Which metal is liquid at room temperature?', 'What is the freezing point of water in Celsius?'];
  const items = asked.map((question, i) => ({ question, answer: `fact ${i}`, alternatives: [] }));
  const outcome = addImportedQuestions(NO_AGENT, items, 'split');
  expect(outcome).toEqual({ exam: 2, study: 6, repeats: 0 });
  expect(exams.items(NO_AGENT)).toHaveLength(2);
  expect(useLearningStore.getState().get(NO_AGENT).bank.filter((b: { status: string }) => b.status === 'approved')).toHaveLength(6);
  // Adding the same set again adds nothing.
  expect(addImportedQuestions(NO_AGENT, items, 'split')).toEqual({ exam: 0, study: 0, repeats: 8 });
});
