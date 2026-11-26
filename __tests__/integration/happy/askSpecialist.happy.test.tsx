/**
 * The assistant asks a specialist agent for help, but only after the person agrees. Real ChatScreen, real tool loop, real
 * consult tool and real agents; only the native model leaf is faked.
 */
import { Alert } from 'react-native';
import { setupChatScreen } from '../../harness/chatHarness';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: () => {}, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} }),
  useRoute: () => require('../../harness/chatHarness').routeHolder,
  useFocusEffect: () => {},
  useIsFocused: () => true,
}));

const answerAlert = (button: string) => jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => { buttons?.find((b) => b.text === button)?.onPress?.(); });

describe('ask another agent', () => {
  afterEach(() => jest.restoreAllMocks());

  it('asks the person first, naming the agent and what it will see', async () => {
    const h = await setupChatScreen({ engine: 'litert' });
    h.enableToolViaUI('ask_specialist');
    h.render();
    const alert = answerAlert('Deny');
    await h.send('how long should I roast a whole chicken?', {
      toolCalls: [{ name: 'ask_specialist', arguments: { question: 'How long do I roast a whole 2 kg chicken?' } }],
      content: 'About 1 hour 20 minutes at 200C.',
    });
    await h.rtl.waitFor(() => { expect(h.view!.queryByText(/1 hour 20 minutes at 200C/)).not.toBeNull(); });
    // Nothing is sent to the other agent until the person agrees, and they are told what it would see.
    expect(alert).toHaveBeenCalledWith('Ask Home Chef?', expect.stringMatching(/How long do I roast a whole 2 kg chicken\?[\s\S]*sees only this question/), expect.anything(), expect.anything());
  });

  it('does not ask the other agent when the person says no', async () => {
    const h = await setupChatScreen({ engine: 'litert' });
    h.enableToolViaUI('ask_specialist');
    h.render();
    answerAlert('Deny');
    await h.send('how long should I roast a whole chicken?', {
      toolCalls: [{ name: 'ask_specialist', arguments: { question: 'How long do I roast a chicken?' } }],
      content: 'Roughly 90 minutes at 190C.',
    });
    await h.rtl.waitFor(() => { expect(h.view!.queryByText(/Roughly 90 minutes/)).not.toBeNull(); });
    expect(h.view!.queryByText(/Asked Home Chef/)).toBeNull();
  });
});
