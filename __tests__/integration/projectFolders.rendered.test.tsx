/** The Projects list: a folder opens to show what is inside it, and CPA exams set up before folders moved into their own project inside the folder. Real stores. */
import { installNativeBoundary, requireRTL } from '../harness/nativeBoundary';

jest.mock('@react-navigation/native', () => ({ ...jest.requireActual('@react-navigation/native'), useNavigation: () => ({ navigate: (global as any).__navigate, push: jest.fn(), goBack: jest.fn() }), useIsFocused: () => true }));

it('shows a folder as one row that opens to FAR, AUD and REG, and opens a project on a tap', () => {
  installNativeBoundary({ fs: true });
  (global as any).__navigate = jest.fn();
  const rtl = requireRTL();
  const React = require('react');
  const { useProjectStore } = require('../../src/stores/projectStore');
  const { ProjectsScreen } = require('../../src/screens/ProjectsScreen');
  useProjectStore.setState({ projects: [] });
  const s = useProjectStore.getState();
  const folder = s.createProject({ name: 'CPA Study', description: '', systemPrompt: '' });
  const far = s.createProject({ name: 'FAR: Financial Accounting', description: '', systemPrompt: '', parentId: folder.id });
  s.createProject({ name: 'AUD: Auditing', description: '', systemPrompt: '', parentId: folder.id });
  s.createProject({ name: 'Cooking', description: '', systemPrompt: '' });
  const view = rtl.render(React.createElement(ProjectsScreen));
  expect(view.getByText('CPA Study')).toBeTruthy();
  expect(view.getByText('Cooking')).toBeTruthy();
  expect(view.queryByText('FAR: Financial Accounting')).toBeNull(); // closed
  rtl.fireEvent.press(view.getByTestId(`project-row-${folder.id}`));
  expect(view.getByText('FAR: Financial Accounting')).toBeTruthy();
  expect(view.getByText('AUD: Auditing')).toBeTruthy();
  rtl.fireEvent.press(view.getByTestId(`project-row-${far.id}`));
  expect((global as any).__navigate).toHaveBeenCalledWith('ProjectDetail', { projectId: far.id });
  rtl.fireEvent.press(view.getByTestId(`open-folder-${folder.id}`));
  expect((global as any).__navigate).toHaveBeenCalledWith('ProjectDetail', { projectId: folder.id });
  rtl.fireEvent.press(view.getByTestId(`project-row-${folder.id}`));
  expect(view.queryByText('FAR: Financial Accounting')).toBeNull(); // closed again
});

it('moves an exam that was on the one shared project into its own project inside it, keeping the documents in the folder', () => {
  installNativeBoundary({ fs: true });
  const { useProjectStore } = require('../../src/stores/projectStore');
  const { useCpa, defaultTopics } = require('../../src/cpa/store');
  const { setupCpaExam } = require('../../src/cpa/setup');
  useProjectStore.setState({ projects: [] });
  const old = useProjectStore.getState().createProject({ name: 'CPA Study', description: '', systemPrompt: '' });
  useCpa.setState({ groupProjectId: old.id, exams: { FAR: { projectId: old.id, topics: defaultTopics('FAR') } } });
  const id = setupCpaExam('FAR');
  expect(id).not.toBe(old.id);
  expect(useProjectStore.getState().projects.find((p: { id: string }) => p.id === id)).toMatchObject({ parentId: old.id });
  expect(useCpa.getState().exams.FAR.projectId).toBe(id);
  expect(setupCpaExam('FAR')).toBe(id); // opening it again changes nothing
  expect(useProjectStore.getState().projects).toHaveLength(2);
});
