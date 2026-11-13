/**
 * CPA exam prep: one tap sets up REG, TCP, FAR and AUD as separate projects; a question bank is read into practice questions
 * filed by topic; a topic is shown as understood only from how different questions were answered. The AI and storage are
 * the device boundary; everything else is real.
 */
import { installNativeBoundary, requireRTL } from '../harness/nativeBoundary';

const mockNavigate = jest.fn();
let mockParams: any = {};
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
  useRoute: () => ({ params: mockParams }),
}));
const mockReply = jest.fn();
jest.mock('../../src/study/engine', () => ({ askModel: (...a: unknown[]) => mockReply(...a), gatherSources: jest.fn(async () => []) }));

const BANK = `1. Under ASC 842, a lessee records which two items for most leases?
Answer: A right-of-use asset and a lease liability
2. Inventory cost under FIFO assumes
a) the newest goods are sold first b) the oldest goods are sold first
Answer: b
3. A bond issued at a discount has an effective rate higher than the stated rate. True or false?
Answer: True`;

const REPLY = JSON.stringify({ questions: [
  { question: 'Under ASC 842, a lessee records which two items for most leases?', answer: 'right-of-use asset; lease liability', topic: 'Leases', explanation: 'A lessee recognises both on the balance sheet.' },
  { question: 'Inventory cost under FIFO assumes', answer: 'b', options: ['the newest goods are sold first', 'the oldest goods are sold first'], topic: 'Inventory' },
  { question: 'A bond issued at a discount has an effective rate higher than the stated rate.', answer: 'True', topic: 'Long-term debt' },
] });

function open() {
  installNativeBoundary({ fs: true });
  mockNavigate.mockClear();
  const rtl = requireRTL();
  const React = require('react');
  const { Alert } = require('react-native');
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  const { ragService } = require('../../src/services/rag');
  jest.spyOn(ragService, 'getDocumentsByProject').mockResolvedValue([]);
  return { rtl, React, screens: require('../../src/cpa/CpaScreens'), stores: { cpa: require('../../src/cpa/store').useCpa, exercises: require('../../src/study/exercises').useExerciseStore, projects: require('../../src/stores/projectStore').useProjectStore } };
}

it('sets up the four exams as separate projects, each with its own checklist', () => {
  const { rtl, React, screens, stores } = open();
  stores.cpa.setState({ exams: {} });
  const view = rtl.render(React.createElement(screens.CpaPrepScreen));
  expect(view.getAllByText('Not set up yet')).toHaveLength(4);
  rtl.fireEvent.press(view.getByTestId('cpa-setup'));
  const names = stores.projects.getState().projects.map((p: { name: string }) => p.name);
  for (const code of ['REG', 'TCP', 'FAR', 'AUD']) expect(names).toContain(`CPA ${code}`);
  const ids = ['REG', 'TCP', 'FAR', 'AUD'].map((c) => stores.cpa.getState().exams[c].projectId);
  expect(new Set(ids).size).toBe(4);
  expect(view.queryByTestId('cpa-setup')).toBeNull();
  expect(view.getAllByText(/0 of \d+ topics understood/).length).toBe(4);
  rtl.fireEvent.press(view.getByTestId('cpa-card-FAR'));
  expect(mockNavigate).toHaveBeenCalledWith('CpaExam', { code: 'FAR' });
  // Setting up again changes nothing.
  stores.cpa.getState().setExam('FAR', { ...stores.cpa.getState().exams.FAR, topics: stores.cpa.getState().exams.FAR.topics.slice(0, 3) });
  require('../../src/cpa/setup').setupAllCpaExams();
  expect(stores.projects.getState().projects.filter((p: { name: string }) => p.name === 'CPA FAR')).toHaveLength(1);
  expect(stores.cpa.getState().exams.FAR.topics).toHaveLength(3);
});

it('reads a question bank into FAR practice, files each question by topic, and shows understanding only from different questions answered', async () => {
  const { rtl, React, screens, stores } = open();
  stores.cpa.setState({ exams: {} });
  stores.exercises.setState({ exercises: {}, progress: {} });
  require('../../src/cpa/setup').setupAllCpaExams();
  const far = stores.cpa.getState().exams.FAR;
  mockParams = { code: 'FAR' };
  mockReply.mockResolvedValue(REPLY);
  const view = rtl.render(React.createElement(screens.CpaExamScreen));

  rtl.fireEvent.changeText(view.getByTestId('import-source'), BANK);
  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId('import-read')); });
  expect(await view.findByText('3 questions found')).toBeTruthy();
  rtl.fireEvent.press(view.getByTestId('import-add'));
  const bank = Object.values(stores.exercises.getState().exercises) as any[];
  expect(bank).toHaveLength(3);
  expect(bank.every((e) => e.projectId === far.projectId)).toBe(true);
  expect(bank.map((e) => e.topic).sort()).toEqual(['Inventory', 'Leases', 'Long-term debt']);
  expect(bank.find((e) => e.topic === 'Inventory').kind).toBe('mcq');
  expect(await view.findByText(/3 practice questions/)).toBeTruthy();

  // Check opens a quiz on that topic in this exam's project.
  const leases = far.topics.find((t: { name: string }) => t.name === 'Leases');
  rtl.fireEvent.press(view.getByTestId(`cpa-check-${leases.id}`));
  expect(mockNavigate).toHaveBeenCalledWith('Practice', { projectId: far.projectId, topic: 'Leases' });

  // One right answer is not understanding; five different right ones are.
  expect(view.getByTestId(`cpa-status-${leases.id}`).props.children).toMatch(/Not checked yet/);
  const lease = bank.find((e) => e.topic === 'Leases');
  await rtl.act(async () => { stores.exercises.getState().record(lease.id, true); });
  expect(view.getByTestId(`cpa-status-${leases.id}`).props.children).toMatch(/1 of 1 right: try at least 5 different questions/);
  const extra = Array.from({ length: 4 }, (_, i) => ({ id: `x${i}`, topic: 'Leases', projectId: far.projectId, kind: 'truefalse', prompt: `Extra leases statement ${i}`, answer: true }));
  await rtl.act(async () => { stores.exercises.getState().addSet(extra as any); extra.forEach((e) => stores.exercises.getState().record(e.id, true)); });
  expect(view.getByTestId(`cpa-status-${leases.id}`).props.children).toMatch(/Understood: 5 of 5 right/);
  expect(view.getByTestId('cpa-summary').props.children.join('')).toMatch(/1 of \d+ topics understood/);

  // Ticking is the person's own mark and is separate from understanding.
  rtl.fireEvent.press(view.getByTestId(`cpa-tick-${leases.id}`));
  expect(stores.cpa.getState().exams.FAR.topics.find((t: { id: string }) => t.id === leases.id).covered).toBe(true);
});

it('the outline can be replaced with the official one, keeping ticks on topics that keep their name', () => {
  const { rtl, React, screens, stores } = open();
  stores.cpa.setState({ exams: {} });
  require('../../src/cpa/setup').setupAllCpaExams();
  mockParams = { code: 'FAR' };
  const far = stores.cpa.getState().exams.FAR;
  const leases = far.topics.find((t: { name: string }) => t.name === 'Leases');
  stores.cpa.getState().toggleCovered('FAR', leases.id);
  const view = rtl.render(React.createElement(screens.CpaExamScreen));
  rtl.fireEvent.press(view.getByTestId('cpa-edit-outline'));
  rtl.fireEvent.changeText(view.getByTestId('cpa-outline-text'), 'Area A:\nLeases\nPensions');
  rtl.fireEvent.press(view.getByTestId('cpa-outline-apply'));
  const topics = stores.cpa.getState().exams.FAR.topics;
  expect(topics.map((t: { name: string }) => t.name)).toEqual(['Leases', 'Pensions']);
  expect(topics[0].covered).toBe(true);
  expect(topics[1].covered).toBe(false);
});

it('Check on a topic opens a quiz of that topic from this exam only, never another exam\'s questions', async () => {
  const { rtl, React, stores } = open();
  const { PracticeScreen } = require('../../src/screens/PracticeScreen');
  const mk = (id: string, projectId: string, topic = 'Leases') => ({ id, topic, projectId, kind: 'truefalse', prompt: `Statement ${id} about ${topic}`, answer: true });
  const mine = ['a1', 'a2', 'a3', 'a4', 'a5'].map((id) => mk(id, 'p-far'));
  const theirs = ['b1', 'b2'].map((id) => mk(id, 'p-reg'));
  stores.exercises.setState({ exercises: Object.fromEntries([...mine, ...theirs, mk('c1', 'p-far', 'Inventory')].map((e) => [e.id, e])), progress: {} });
  mockParams = { projectId: 'p-far', topic: 'Leases' };
  const view = rtl.render(React.createElement(PracticeScreen));
  const shown = await view.findByText(/Statement \w+ about Leases/);
  expect(['a1', 'a2', 'a3', 'a4', 'a5'].some((id) => String(shown.props.children).includes(`Statement ${id} `))).toBe(true);
  expect(view.queryByText(/Statement b\d/)).toBeNull();
  expect(view.queryByText(/about Inventory/)).toBeNull();
});

it('shows how many days are left and how many topics a week that means once an exam date is set', () => {
  const { rtl, React, screens, stores } = open();
  stores.cpa.setState({ exams: {} });
  require('../../src/cpa/setup').setupAllCpaExams();
  mockParams = { code: 'AUD' };
  const view = rtl.render(React.createElement(screens.CpaExamScreen));
  expect(view.getByText(/Add your exam date/)).toBeTruthy();
  expect(view.getByTestId('cpa-date-set').props.accessibilityState?.disabled).toBe(true);
  const date = new Date(Date.now() + 70 * 86_400_000);
  const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  rtl.fireEvent.changeText(view.getByTestId('cpa-date-input'), iso);
  rtl.fireEvent.press(view.getByTestId('cpa-date-set'));
  expect(view.getByTestId('cpa-pace').props.children).toMatch(/^70 days to go, \d+ topics still to understand: about [\d.]+ a week\.$/);
});

it('each exam is its own board-game course, one lesson per topic, from its own project, and playing a square ticks the topic', () => {
  const { rtl, React, screens, stores } = open();
  stores.cpa.setState({ exams: {} });
  require('../../src/cpa/setup').setupAllCpaExams();
  const { useTopics } = require('../../src/topics/store');
  useTopics.setState({ courses: [] });
  mockParams = { code: 'FAR' };
  const view = rtl.render(React.createElement(screens.CpaExamScreen));
  rtl.fireEvent.press(view.getByTestId('cpa-board-open'));
  const exam = stores.cpa.getState().exams.FAR;
  const course = useTopics.getState().courses.find((c: { id: string }) => c.id === exam.courseId);
  expect(mockNavigate).toHaveBeenCalledWith('TopicBoard', { courseId: course.id });
  expect(course.projectId).toBe(exam.projectId);
  const lessons = course.squares.filter((s: { format: string }) => s.format === 'lesson');
  expect(lessons.map((s: { title: string }) => s.title)).toEqual(exam.topics.map((t: { name: string }) => t.name.slice(0, 60)));
  expect(course.squares[course.squares.length - 1]).toMatchObject({ format: 'quiz', checkpoint: true });
  // A second tap opens the same board; it is not made twice.
  rtl.fireEvent.press(view.getByTestId('cpa-board-open'));
  expect(useTopics.getState().courses).toHaveLength(1);
  // Playing the first lesson ticks its topic.
  const first = exam.topics[0];
  expect(view.getByTestId(`cpa-tick-${first.id}`).props.accessibilityState.checked).toBe(false);
  rtl.act(() => { useTopics.getState().complete(course.id, lessons[0].key, 3); });
  expect(view.getByTestId(`cpa-tick-${first.id}`).props.accessibilityState.checked).toBe(true);
  // Rebuilding starts a fresh board.
  rtl.fireEvent.press(view.getByTestId('cpa-board-rebuild'));
  const { Alert } = require('react-native');
  const buttons = (Alert.alert as jest.Mock).mock.calls.pop()[2];
  rtl.act(() => { buttons[1].onPress(); });
  expect(useTopics.getState().courses).toHaveLength(1);
  expect(stores.cpa.getState().exams.FAR.courseId).not.toBe(course.id);
});

it('the bar exam and other professional exams set up on a tap, each its own project and board, apart from the CPA exams', () => {
  const { rtl, React, screens, stores } = open();
  stores.cpa.setState({ exams: {} });
  const view = rtl.render(React.createElement(screens.CpaPrepScreen));
  expect(view.getByText('More exams and tests')).toBeTruthy();
  rtl.fireEvent.press(view.getByTestId('exam-field-Law and medicine-toggle'));
  rtl.fireEvent.press(view.getByTestId('cpa-card-BAR'));
  const bar = stores.cpa.getState().exams.BAR;
  expect(bar.topics.length).toBeGreaterThan(20);
  expect(mockNavigate).toHaveBeenCalledWith('CpaExam', { code: 'BAR' });
  expect(stores.projects.getState().projects.map((p: { name: string }) => p.name)).toContain('Bar exam');
  expect(stores.cpa.getState().exams.REG).toBeUndefined();
  const { ensureExamCourse } = require('../../src/cpa/course');
  const { useTopics } = require('../../src/topics/store');
  const id = ensureExamCourse('BAR');
  expect(useTopics.getState().courses.find((c: { id: string }) => c.id === id)).toMatchObject({ title: expect.stringContaining('Bar exam'), projectId: bar.projectId });
  rtl.fireEvent.press(view.getByTestId('cpa-setup'));
  expect(stores.cpa.getState().exams.REG).toBeTruthy();
});

it('lists the other exams and tests in sections (accounting, law and medicine, admissions, project and IT) and sets one up on a tap', () => {
  const { rtl, React, screens, stores } = open();
  stores.cpa.setState({ exams: {} });
  const view = rtl.render(React.createElement(screens.CpaPrepScreen));
  expect(view.getByText(/College and graduate admissions \(SAT, ACT, GRE, GMAT\)/)).toBeTruthy();
  rtl.fireEvent.press(view.getByTestId('exam-field-College and graduate admissions-toggle'));
  rtl.fireEvent.press(view.getByTestId('cpa-card-GRE'));
  expect(stores.projects.getState().projects.map((p: { name: string }) => p.name)).toContain('GRE');
  expect(stores.cpa.getState().exams.GRE.topics.map((t: { area: string }) => t.area)).toContain('Quantitative reasoning');
  rtl.fireEvent.press(view.getByTestId('exam-field-Accounting, tax and finance-toggle'));
  rtl.fireEvent.press(view.getByTestId('cpa-card-CMA1'));
  expect(stores.cpa.getState().exams.CMA1).toBeTruthy();
});
