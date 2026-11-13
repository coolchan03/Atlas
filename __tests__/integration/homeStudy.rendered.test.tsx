/** Home carries on studying in one tap, finds anything by name, and missed quiz answers come back as review questions. */
import { installNativeBoundary, requireRTL } from '../harness/nativeBoundary';

const mockNavigate = jest.fn();
const navigation = { navigate: jest.fn(), getParent: () => ({ navigate: mockNavigate }) };
jest.mock('@react-navigation/native', () => ({ ...jest.requireActual('@react-navigation/native'), useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }) }));

const course = (over: Record<string, unknown> = {}) => ({ id: 'c1', topic: 'Algebra', title: 'Algebra basics', summary: '', style: '', theme: '', request: { topic: 'Algebra', goal: '', level: 'x', how: '', minutes: 10 },
  squares: [{ key: 's1', format: 'lesson', title: 'Variables', focus: 'x', unit: 'U' }, { key: 's2', format: 'quiz', title: 'Equations quiz', focus: 'x', unit: 'U' }],
  content: {}, progress: { s1: { stars: 3 } }, createdAt: 1, lastPlayedAt: 5, sources: [], ...over });

it('offers the next square of the course played last, what is due, and finds things by name', () => {
  installNativeBoundary({ fs: true });
  mockNavigate.mockClear();
  const rtl = requireRTL();
  const React = require('react');
  const { HomeSearch, HomeStudyCard } = require('../../src/screens/HomeScreen/HomeStudyCard');
  const { useTopics } = require('../../src/topics/store');
  const { useExerciseStore } = require('../../src/study/exercises');
  const { useProjectStore } = require('../../src/stores/projectStore');
  useTopics.setState({ courses: [course()] });
  useExerciseStore.setState({ exercises: { e1: { id: 'e1', kind: 'truefalse', prompt: 'q', answer: true } }, progress: { e1: { box: 0, due: 0, attempts: 1, correct: 0, last: false } } });
  useProjectStore.getState().createProject({ name: 'Therapy notes', description: '', systemPrompt: '', icon: '#10B981' });
  const study = rtl.render(React.createElement(HomeStudyCard, { navigation }));
  expect(study.getByText('Continue: Equations quiz')).toBeTruthy();
  expect(study.getByText('1 question to review')).toBeTruthy();
  rtl.fireEvent.press(study.getByTestId('home-continue'));
  expect(mockNavigate).toHaveBeenCalledWith('TopicSquare', { courseId: 'c1', key: 's2' });
  rtl.fireEvent.press(study.getByTestId('home-review'));
  expect(mockNavigate).toHaveBeenLastCalledWith('Practice', undefined);

  const onTile = jest.fn();
  const search = rtl.render(React.createElement(HomeSearch, { navigation, tiles: [{ key: 'maps', label: 'Maps', hint: 'Offline maps' }], onTile }));
  rtl.fireEvent.changeText(search.getByTestId('home-search'), 'maps');
  rtl.fireEvent.press(search.getByTestId('home-hit-screen-maps'));
  expect(onTile).toHaveBeenCalledWith('maps');
  rtl.fireEvent.changeText(search.getByTestId('home-search'), 'therapy');
  expect(search.getByText('Therapy notes')).toBeTruthy();
  rtl.fireEvent.changeText(search.getByTestId('home-search'), 'algebra');
  rtl.fireEvent.press(search.getByText('Algebra basics'));
  expect(mockNavigate).toHaveBeenLastCalledWith('TopicBoard', { courseId: 'c1' });
});

it('quiz answers got wrong are kept for spaced review in Practice', () => {
  installNativeBoundary({ fs: true });
  const { keepMissed, dueCount } = require('../../src/topics/review');
  const { useExerciseStore } = require('../../src/study/exercises');
  useExerciseStore.setState({ exercises: {}, progress: {} });
  const c = course({ projectId: 'p1' });
  const content = { kind: 'quiz', questions: [{ q: 'A?', options: ['1', '2'], answer: 0, why: 'w' }, { q: 'B?', options: ['1', '2'], answer: 1, why: '' }] };
  expect(keepMissed(c, c.squares[1], content, [1])).toBe(1);
  const [kept] = Object.values(useExerciseStore.getState().exercises) as any[];
  expect(kept).toMatchObject({ kind: 'mcq', prompt: 'B?', topic: 'Equations quiz', projectId: 'p1', answer: 1 });
  expect(dueCount()).toBe(1);
});
