import { setupChatScreen } from '../../harness/chatHarness';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: () => {}, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} }),
  useRoute: () => require('../../harness/chatHarness').routeHolder,
  useFocusEffect: () => {}, useIsFocused: () => true,
}));

it('keeps a small manual context after native allocation failures and resumes chat', async () => {
  const h = await setupChatScreen({ engine: 'llama', platform: 'android' });
  h.render();
  await h.send('hello', { text: 'Ready for a smaller context.' });
  const { ChatContextSection } = require('../../../src/components/GenerationSettingsModal/ChatContextSection');
  const settings = h.rtl.render(h.React.createElement(ChatContextSection));
  h.rtl.fireEvent.press(settings.getByLabelText('Use 2K manual context'));
  settings.unmount();
  h.setTextSettingViaUI('contextLength', 1024);

  const init = h.boundary.llama!.module.initLlama;
  const nativeInit = init.getMockImplementation()!;
  let transientFailures = 2;
  init.mockImplementation(async (params: Record<string, unknown>) => {
    if (Number(params.n_ctx) > 1024) throw new Error('Context exceeds available memory');
    if (transientFailures-- > 0) throw new Error('Temporary native allocation failure');
    return nativeInit(params);
  });
  const banner = await h.rtl.waitFor(() => h.view!.getByTestId('reload-model-banner'));
  await h.rtl.act(async () => {
    type PressNode = { props: { onPress?: () => void }; parent: PressNode | null };
    let node = banner as unknown as PressNode | null;
    while (node && typeof node.props.onPress !== 'function') node = node.parent;
    if (!node?.props.onPress) throw new Error('Reload button has no press handler');
    node.props.onPress();
  });
  await h.rtl.waitFor(() => {
    expect(h.view!.queryByTestId('reload-model-banner')).toBeNull();
  }, { timeout: 20000 });
  await h.send('continue', { text: 'The small context still works.' });
  await h.rtl.waitFor(() => {
    expect(h.view!.queryByText('The small context still works.')).not.toBeNull();
  });
  const { llmService } = require('../../../src/services/llm');
  expect(llmService.getPerformanceSettings().contextLength).toBe(1024);
  h.view!.unmount();
}, 30000);
