/**
 * Atlas intentionally suppresses the upstream promotional share prompt so normal
 * local-AI conversations are never interrupted by a marketing sheet.
 */
import { setupChatScreen } from '../../harness/chatHarness';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: () => {}, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} }),
  useRoute: () => require('../../harness/chatHarness').routeHolder,
  useFocusEffect: () => {},
  useIsFocused: () => true,
}));

const SHEET_TITLE = 'Support Open-Source AI';

describe('Atlas chat does not interrupt generation with the upstream share prompt', () => {
  it('keeps the support-share sheet suppressed across repeated generations', async () => {
    const h = await setupChatScreen({ engine: 'llama', platform: 'android' });
    h.render();

    for (let i = 1; i <= 3; i++) {
      await h.send(`prompt ${i}`, { text: `reply ${i}` });
      expect(h.view!.queryByText(SHEET_TITLE)).toBeNull();
    }

    await h.settle(1700);
    expect(h.view!.queryByText(SHEET_TITLE)).toBeNull();
  }, 30000);
});
