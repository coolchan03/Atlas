/** Specialists (Writer, Repair Helper, Home Chef...) are not offered when choosing an agent for a chat; the one already chosen stays. */
import { installNativeBoundary, requireRTL } from '../harness/nativeBoundary';

it('lists working agents in the chat picker and leaves out the specialists, except one that is already active', () => {
  installNativeBoundary({ fs: true });
  const rtl = requireRTL();
  const React = require('react');
  const { useAgentStore } = require('../../src/stores/agentStore');
  const { AgentChip } = require('../../src/components/AgentChip');
  const styles = { headerProjectRow: {}, headerSubtitle: {} };
  const colors = { primary: '#0a0', textMuted: '#888', text: '#000', textSecondary: '#444', surface: '#fff' };

  useAgentStore.setState({ activeAgentId: null });
  const view = rtl.render(React.createElement(AgentChip, { styles, colors }));
  rtl.fireEvent.press(view.getByTestId('agent-selector'));
  expect(view.getByText('Therapist')).toBeTruthy();
  for (const name of ['Writer', 'Repair Helper', 'Home Chef', 'Accountant', 'Paperwork Reader']) expect(view.queryByText(name)).toBeNull();
  view.unmount();

  // A chat that already uses a specialist still shows it, so the person can see and change it.
  useAgentStore.setState({ activeAgentId: 'writer' });
  const second = rtl.render(React.createElement(AgentChip, { styles, colors }));
  rtl.fireEvent.press(second.getByTestId('agent-selector'));
  expect(second.getAllByText('Writer').length).toBeGreaterThan(0);
  expect(second.queryByText('Repair Helper')).toBeNull();
});
