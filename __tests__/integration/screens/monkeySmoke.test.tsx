import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';
import { explore } from '../../harness/monkey';

const mockNav = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => () => undefined), canGoBack: () => true, getParent: () => ({ navigate: jest.fn() }) };
let mockParams: any = {};
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNav, useRoute: () => ({ params: mockParams }), useFocusEffect: (cb: () => void) => { require('react').useEffect(cb, []); }, useIsFocused: () => true,
}));

const mountAndExplore = async (path: string, name: string, params: any = {}, seed = 1, presses = 50) => {
  jest.resetModules();
  installNativeBoundary({ fs: true });
  mockParams = params;
  const rtl = requireRTL();
  const React = require('react');
  const Screen = require(path)[name];
  const view = rtl.render(React.createElement(Screen));
  const out = await explore(view as never, { seed, presses });
  view.unmount();
  return out;
};

describe('screens survive being pressed everywhere (smoke)', () => {
  it.each([
    ['../../../src/screens/MyModelsScreen', 'MyModelsScreen'],
    ['../../../src/screens/PresentationScreen', 'PresentationScreen'],
    ['../../../src/screens/AgentEditScreen', 'AgentEditScreen'],
  ])('%s', async (path, name) => {
    const out = await mountAndExplore(path, name);
    expect(out.pressed).toBeGreaterThan(0);
  });
});
