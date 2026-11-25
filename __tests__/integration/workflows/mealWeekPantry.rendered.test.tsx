/** "A week of dinners": a photo of the shelf fills the "What you already have" box (not the main box), where it can be edited. */
import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';

jest.mock('@react-navigation/native', () => ({ ...jest.requireActual('@react-navigation/native'), useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }) }));
jest.mock('../../../src/services/llm', () => ({ llmService: { supportsVision: () => true, generateResponse: jest.fn(async () => '- Eggs\n- Spinach\n- rice') } }));
jest.mock('../../../src/atlasTools/models', () => ({ ensureTextModel: jest.fn(async () => undefined) }));
jest.mock('../../../src/services/llmJobQueue', () => ({ runBackgroundJob: (fn: () => unknown) => fn() }));

it('puts what the photo shows into "What you already have", and leaves the main box alone', async () => {
  installNativeBoundary({ fs: true });
  const rtl = requireRTL();
  const React = require('react');
  const { WorkflowsScreen } = require('../../../src/workflows/WorkflowsScreen');
  const view = rtl.render(React.createElement(WorkflowsScreen));
  rtl.fireEvent.press(view.getByTestId('workflow-mealweek'));
  rtl.fireEvent.changeText(view.getByTestId('workflow-text'), 'we like pasta and curry');
  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId('workflow-photo-library')); });
  expect(view.getByPlaceholderText('for example: eggs, rice, spinach').props.value).toBe('eggs, spinach, rice');
  expect(view.getByTestId('workflow-text').props.value).toBe('we like pasta and curry');
  // A second photo adds to the list.
  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId('workflow-photo-camera')); });
  expect(view.getByPlaceholderText('for example: eggs, rice, spinach').props.value).toBe('eggs, spinach, rice, eggs, spinach, rice');
});
