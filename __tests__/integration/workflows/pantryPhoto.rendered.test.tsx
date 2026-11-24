/**
 * "Dinner from what I have": take a photo of the shelf, the AI names what it sees, the list lands in the text box where it can be edited,
 * and a picture with no food is explained in plain words. The model's eyes are the device boundary.
 */
import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';

jest.mock('@react-navigation/native', () => ({ ...jest.requireActual('@react-navigation/native'), useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }) }));
const mockSees = { value: true, reply: '' };
jest.mock('../../../src/services/llm', () => ({ llmService: { supportsVision: () => mockSees.value, generateResponse: jest.fn(async () => mockSees.reply) } }));
jest.mock('../../../src/atlasTools/models', () => ({ ensureTextModel: jest.fn(async () => undefined) }));
jest.mock('../../../src/services/llmJobQueue', () => ({ runBackgroundJob: (fn: () => unknown) => fn() }));

it('fills the ingredient list from a photo (cleaned in code, editable), and explains a model that cannot see or a picture with no food', async () => {
  installNativeBoundary({ fs: true });
  const rtl = requireRTL();
  const React = require('react');
  const { WorkflowsScreen } = require('../../../src/workflows/WorkflowsScreen');
  const view = rtl.render(React.createElement(WorkflowsScreen));
  rtl.fireEvent.press(view.getByTestId('workflow-cook'));

  mockSees.reply = '- Eggs\n- Tomatoes.\n2) rice\nrice\nI think there might also be some kind of container with leftovers inside it';
  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId('workflow-photo-library')); });
  expect(view.getByTestId('workflow-text').props.value).toBe('eggs, tomatoes, rice');

  // A second photo adds to the list instead of replacing what was typed.
  mockSees.reply = 'onions';
  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId('workflow-photo-camera')); });
  expect(view.getByTestId('workflow-text').props.value).toBe('eggs, tomatoes, rice, onions');

  mockSees.reply = 'NONE';
  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId('workflow-photo-library')); });
  expect(view.getByTestId('workflow-photo-error').props.children).toMatch(/No food could be seen/);

  mockSees.value = false;
  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId('workflow-photo-library')); });
  expect(view.getByTestId('workflow-photo-error').props.children).toMatch(/cannot see pictures/);
});
