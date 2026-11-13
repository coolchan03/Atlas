import { requireRTL } from '../harness/nativeBoundary';

jest.mock('@react-navigation/native', () => ({ ...jest.requireActual('@react-navigation/native'), useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }), useRoute: () => ({ params: {} }) }));

it('shows running and failed work, cancels, retries and dismisses, and hides a protected project name', async () => {
  const rtl = requireRTL();
  const React = require('react');
  const { TaskCenterScreen } = require('../../src/tasks/TaskCenterScreen');
  const { useTasks, trackTask } = require('../../src/tasks/taskRegistry');
  useTasks.setState({ tasks: [] });
  const view = rtl.render(React.createElement(TaskCenterScreen));
  expect(view.getByTestId('tasks-empty')).toBeTruthy();

  const running = rtl.act(() => useTasks.getState().start({ type: 'zip', title: 'Unpacking course', protectedScope: true }));
  const id = useTasks.getState().tasks[0].id;
  rtl.act(() => useTasks.getState().update(id, { stage: 'chapter 2', completed: 2, total: 8 }));
  await rtl.waitFor(() => expect(view.getByTestId(`task-status-${id}`).props.children.join('')).toMatch(/Running: chapter 2 \(25%\)/));
  expect(view.queryByText('Unpacking course')).toBeNull(); // protected
  expect(view.getByText('Protected item')).toBeTruthy();
  rtl.fireEvent.press(view.getByTestId(`task-cancel-${id}`));
  expect(useTasks.getState().tasks[0].cancelRequested).toBe(true);
  void running;

  let calls = 0;
  await rtl.act(async () => { await trackTask({ type: 'import', title: 'Add files', retryable: true }, async () => { calls++; if (calls === 1) throw new Error('Broken PDF'); }).catch(() => undefined); });
  const failed = useTasks.getState().tasks.find((t: any) => t.title === 'Add files');
  await rtl.waitFor(() => expect(view.getByTestId(`task-status-${failed.id}`).props.children.join('')).toMatch(/Failed/));
  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId(`task-retry-${failed.id}`)); await new Promise((r) => setTimeout(r, 0)); });
  expect(calls).toBe(2);
  await rtl.waitFor(() => expect(view.getByTestId(`task-status-${failed.id}`).props.children.join('')).toMatch(/Done/));
  rtl.fireEvent.press(view.getByTestId(`task-dismiss-${failed.id}`));
  expect(useTasks.getState().tasks.find((t: any) => t.id === failed.id)).toBeUndefined();
});
