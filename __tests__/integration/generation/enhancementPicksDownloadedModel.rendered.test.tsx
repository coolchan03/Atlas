/**
 * Enhance image prompts keeps working when no text model is chosen (it was unloaded, or only
 * image models were ever used): it loads a downloaded text model for the rewrite instead of
 * quietly using the plain prompt, which looked like the setting had turned itself off.
 */
import { setupChatScreen } from '../../harness/chatHarness';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: () => {}, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} }),
  useRoute: () => require('../../harness/chatHarness').routeHolder,
  useFocusEffect: () => {}, useIsFocused: () => true,
}));

const ENHANCED = 'a photorealistic tabby cat in a sunlit garden, soft light';

it('enhances the prompt with a downloaded text model when none is selected', async () => {
  const h = await setupChatScreen({ engine: 'llama', platform: 'android' });
  h.render();
  await h.placeImageModel({ backend: 'coreml' });
  const { activeModelService } = require('../../../src/services/activeModelService');
  await activeModelService.loadImageModel('sd');
  await h.cycleImageMode();
  await h.rtl.waitFor(() => { expect(h.view!.queryByTestId('image-mode-force-badge')).not.toBeNull(); });
  h.useAppStore.getState().updateSettings({ enhanceImagePrompts: true });

  // The text model is downloaded but not chosen any more.
  await activeModelService.unloadTextModel();
  h.useAppStore.setState({ activeModelId: null, lastTextModelId: null });
  expect(h.useAppStore.getState().downloadedModels.length).toBeGreaterThan(0);

  h.boundary.llama!.scriptCompletion({ text: ENHANCED });
  await h.tapSend('draw a cat');
  await h.rtl.waitFor(() => { expect(h.boundary.diffusion.calls.generateImage.length).toBe(1); }, { timeout: 8000 });
  expect(JSON.stringify(h.boundary.diffusion.calls.generateImage[0])).toContain('tabby cat');
}, 20000);
