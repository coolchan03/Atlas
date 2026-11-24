/** The project's own rules for reading its documents: typed, kept on the project, with the built-in rules one tap away. */
import { installNativeBoundary, requireRTL } from '../harness/nativeBoundary';

it('saves the person\'s rules on the project and shows the built-in rules on request', () => {
  installNativeBoundary({ fs: true });
  const rtl = requireRTL();
  const React = require('react');
  const { SourceRulesBox } = require('../../src/components/SourceRulesBox');
  const { useProjectStore } = require('../../src/stores/projectStore');
  const project = useProjectStore.getState().createProject({ name: 'Federal tax', description: '', systemPrompt: '', icon: '#10B981' });
  const view = rtl.render(React.createElement(SourceRulesBox, { projectId: project.id }));
  expect(view.queryByTestId('source-rules-default-text')).toBeNull();
  rtl.fireEvent.press(view.getByTestId('source-rules-default'));
  expect(view.getByTestId('source-rules-default-text').props.children).toMatch(/Rank them, highest first/);
  rtl.fireEvent.changeText(view.getByTestId('source-rules-input'), 'The Code wins over everything else.');
  expect(useProjectStore.getState().getProject(project.id).sourceRules).toBe('The Code wins over everything else.');
});
