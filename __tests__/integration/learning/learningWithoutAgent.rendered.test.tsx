/**
 * Learning mode can run without an agent: pick "No agent", write the lessons, and they are kept with the learning
 * history while the agent list stays untouched. Fakes only the device boundary.
 */
import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
  useRoute: () => ({ params: {} }),
}));

it('keeps lessons with the learning history when "No agent" is chosen, and does not touch any agent', () => {
  installNativeBoundary({ fs: true });
  const rtl = requireRTL();
  const React = require('react');
  const { LearningScreen } = require('../../../src/screens/LearningScreen');
  const { useAgentStore } = require('../../../src/stores/agentStore');
  const { useLearningStore } = require('../../../src/learning/store');
  const { NO_AGENT } = require('../../../src/learning/agents');

  const agentsBefore = JSON.stringify(useAgentStore.getState().agents);
  const view = rtl.render(React.createElement(LearningScreen));
  rtl.fireEvent.press(view.getByTestId('learning-no-agent'));
  rtl.fireEvent.changeText(view.getByPlaceholderText(/None yet/), '- Always give an example');
  expect(useLearningStore.getState().get(NO_AGENT).lessons).toBe('- Always give an example');
  expect(JSON.stringify(useAgentStore.getState().agents)).toBe(agentsBefore);
});
