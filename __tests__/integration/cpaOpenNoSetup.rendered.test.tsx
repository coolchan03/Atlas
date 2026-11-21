/** Opening an exam's page does not set the exam up (no folder, no checklist) unless the person already did; it only moves one set up earlier into its own project. */
import { installNativeBoundary, requireRTL } from '../harness/nativeBoundary';

jest.mock('@react-navigation/native', () => ({ ...jest.requireActual('@react-navigation/native'), useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }), useRoute: () => ({ params: { code: 'CFA1' } }) }));

it('shows "set up first" for an exam not set up, and makes no project or checklist', () => {
  installNativeBoundary({ fs: true });
  const rtl = requireRTL();
  const React = require('react');
  const { CpaExamScreen } = require('../../src/cpa/CpaScreens');
  const { useCpa } = require('../../src/cpa/store');
  const { useProjectStore } = require('../../src/stores/projectStore');
  useCpa.setState({ exams: {}, groupProjectId: undefined });
  useProjectStore.setState({ projects: [] });
  const view = rtl.render(React.createElement(CpaExamScreen));
  expect(view.getByText(/Set up the exams first/)).toBeTruthy();
  expect(useCpa.getState().exams.CFA1).toBeUndefined();
  expect(useProjectStore.getState().projects).toHaveLength(0);
});
