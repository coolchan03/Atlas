/** Home shows how many review cards are due across projects, names the busiest, and opens that project's study screen. */
import { installNativeBoundary, requireRTL } from '../harness/nativeBoundary';

it('counts due cards across projects, leaves out protected ones, and opens the busiest project', () => {
  jest.resetModules();
  installNativeBoundary({ fs: true });
  const rtl = requireRTL();
  const React = require('react');
  const { ReviewDueCard } = require('../../src/components/ReviewDueCard');
  const { useStudyProgress } = require('../../src/study/progress');
  const { useProjectStore } = require('../../src/stores/projectStore');
  const { useNudges } = require('../../src/atlasTools/nudges');
  const project = (id: string, extra = {}) => ({ id, name: id.toUpperCase(), description: '', systemPrompt: '', createdAt: 'x', updatedAt: 'x', ...extra });
  useProjectStore.setState({ projects: [project('far'), project('reg'), project('secret', { pinVerifier: 'v', protectedBlob: 'b' })] });
  const card = (projectId: string, n: number, due: number) => ({ key: `${projectId}${n}`, projectId, prompt: 'q', answer: 'a', ease: 2.5, interval: 1, reps: 1, due, correct: 1, wrong: 0 });
  const past = Date.now() - 1000; const future = Date.now() + 864e5;
  const items: Record<string, unknown> = {};
  for (let n = 0; n < 4; n++) items[`far${n}`] = card('far', n, past);
  for (let n = 0; n < 2; n++) items[`reg${n}`] = card('reg', n, past);
  items.later = card('far', 9, future);
  for (let n = 0; n < 9; n++) items[`s${n}`] = card('secret', n, past);
  useStudyProgress.setState({ items });
  const onOpen = jest.fn();
  const view = rtl.render(React.createElement(ReviewDueCard, { onOpen }));
  expect(view.getByText('6 review cards due')).toBeTruthy();
  expect(view.getByText('FAR 4, REG 2')).toBeTruthy();
  rtl.fireEvent.press(view.getByTestId('review-due'));
  expect(onOpen).toHaveBeenCalledWith('far');
  rtl.act(() => { useNudges.getState().setNudge('reviewsDue', false); });
  expect(view.queryByTestId('review-due')).toBeNull();
});
