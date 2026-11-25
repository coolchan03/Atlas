/** A law project's case file: documents in order of authority, older editions marked, and a court decision checked for later bad treatment through the web search. */
import { installNativeBoundary, requireRTL } from '../harness/nativeBoundary';

// The web is the device boundary here: the search results a provider would return.
const mockResults: Array<{ title: string; snippet: string; url: string }> = [];
jest.mock('../../src/services/tools/webSearchProviders', () => ({ searchWeb: jest.fn(async () => ({ results: mockResults, provider: 'fake', notes: [] })) }));

it('lists documents by authority, marks an older edition, and flags a case with warning words in later results', async () => {
  installNativeBoundary({ fs: true });
  const React = require('react');
  const rtl = requireRTL();
  const { useProjectStore } = require('../../src/stores/projectStore');
  const { CaseFileCard } = require('../../src/components/CaseFileCard');
  const project = useProjectStore.getState().createProject({ name: 'Contract dispute', description: '', systemPrompt: '', icon: '#10B981' });
  useProjectStore.getState().updateProject(project.id, { profileId: 'law' });
  const names = ['State Contract Statute 2019.pdf', 'State Contract Statute 2023.pdf', 'Smith v Jones 2015.pdf', 'Practice Guide Contracts.pdf'];
  const view = rtl.render(React.createElement(CaseFileCard, { projectId: project.id, names }));
  expect(view.getByText('1. Statute (2)')).toBeTruthy();
  expect(view.getByText('2. Court decision (1)')).toBeTruthy();
  expect(view.getByText('3. Commentary (1)')).toBeTruthy();
  expect(view.getByText(/State Contract Statute 2019\.pdf · older edition, not used/)).toBeTruthy();

  mockResults.push({ title: 'Brown v Green', snippet: 'The court overruled Smith v Jones in 2021.', url: 'https://example.org/a' }, { title: 'Other', snippet: 'Smith v Jones was followed.', url: 'https://example.org/b' });
  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId('case-check-btn-Smith v Jones 2015.pdf')); });
  const found = view.getByTestId('case-check-Smith v Jones 2015.pdf');
  expect(JSON.stringify(found.props.children)).toMatch(/1 of 2 results have warning words \(Brown v Green\)/);
  expect(view.getByText('Check again')).toBeTruthy();
});

it('is not shown for a project that is not law', () => {
  installNativeBoundary({ fs: true });
  const React = require('react');
  const rtl = requireRTL();
  const { useProjectStore } = require('../../src/stores/projectStore');
  const { CaseFileCard } = require('../../src/components/CaseFileCard');
  const project = useProjectStore.getState().createProject({ name: 'Cooking', description: '', systemPrompt: '', icon: '#10B981' });
  const view = rtl.render(React.createElement(CaseFileCard, { projectId: project.id, names: ['Recipes.pdf'] }));
  expect(view.queryByTestId('case-file')).toBeNull();
});
