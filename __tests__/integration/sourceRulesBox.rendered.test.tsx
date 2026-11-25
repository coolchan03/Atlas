/** The project's own rules for reading its documents: typed, kept on the project, with the built-in rules one tap away. */
import { installNativeBoundary, requireRTL } from '../harness/nativeBoundary';

it('saves the person\'s rules on the project and shows the built-in rules on request', () => {
  installNativeBoundary({ fs: true });
  const rtl = requireRTL();
  const React = require('react');
  const { SourceRulesBox } = require('../../src/components/SourceRulesBox');
  const { useProjectStore } = require('../../src/stores/projectStore');
  const project = useProjectStore.getState().createProject({ name: 'Federal tax', description: '', systemPrompt: '', icon: '#10B981' });
  const view = rtl.render(React.createElement(SourceRulesBox, { projectId: project.id, names: ['Title 26 - Internal Revenue Code.pdf'] }));
  expect(view.queryByTestId('source-rules-default-text')).toBeNull();
  rtl.fireEvent.press(view.getByTestId('source-rules-default'));
  expect(view.getByTestId('source-rules-default-text').props.children).toMatch(/Rank them, highest first: the Internal Revenue Code/); // automatic: tax material is recognised

  // Another field, and a profile written by the person (a line that cannot be read is pointed out).
  rtl.fireEvent.press(view.getByTestId('profile-equities'));
  expect(useProjectStore.getState().getProject(project.id).profileId).toBe('equities');
  expect(view.getByTestId('source-rules-default-text').props.children).toMatch(/SEC filings, exchange and regulator rules/);
  rtl.fireEvent.press(view.getByTestId('profile-custom'));
  rtl.fireEvent.changeText(view.getByTestId('profile-custom-text'), 'Statutes | code, statute | edition\nbroken line');
  expect(view.getByTestId('profile-problem').props.children).toMatch(/Line 2 needs a name/);
  expect(useProjectStore.getState().getProject(project.id).customProfile).toContain('Statutes | code');
  rtl.fireEvent.changeText(view.getByTestId('source-rules-input'), 'The Code wins over everything else.');
  expect(useProjectStore.getState().getProject(project.id).sourceRules).toBe('The Code wins over everything else.');
  // The second set of instructions: how to use each document. What Atlas understood is shown file by file.
  rtl.fireEvent.changeText(view.getByTestId('source-guide-input'), 'The Title 26 - Internal Revenue Code is the most up to date.');
  expect(useProjectStore.getState().getProject(project.id).sourceGuide).toMatch(/most up to date/);
  expect(view.getByText(/Revenue Code.pdf: the most up to date/)).toBeTruthy();
});
