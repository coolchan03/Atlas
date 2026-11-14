import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';
import { explore } from '../../harness/monkey';
import { seedApp, type Seeded } from '../../harness/monkeySeed';

const mockNav = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => () => undefined), canGoBack: () => true, getParent: () => ({ navigate: jest.fn() }) };
jest.mock('@react-navigation/native', () => ({ ...jest.requireActual('@react-navigation/native'), useNavigation: () => mockNav, useRoute: () => ({ params: {} }), useFocusEffect: (cb: () => void) => { require('react').useEffect(cb, []); }, useIsFocused: () => true }));

type Props = Record<string, unknown> | ((ids: Seeded) => Record<string, unknown>);
const open = { visible: true, onClose: jest.fn() };
const exercises = [
  { id: 'e1', kind: 'mcq', prompt: 'Pick one', choices: ['a', 'b', 'c'], answer: 1 }, { id: 'e2', kind: 'truefalse', prompt: 'True?', answer: true },
  { id: 'e3', kind: 'fill', prompt: 'Fill', answers: ['x'] }, { id: 'e4', kind: 'calc', prompt: 'Sum', answer: 4 }, { id: 'e5', kind: 'order', prompt: 'Order', items: ['a', 'b', 'c'] },
  { id: 'e6', kind: 'match', prompt: 'Match', pairs: [['a', '1'], ['b', '2']] }, { id: 'e7', kind: 'short', prompt: 'Explain', keyTerms: ['lease', 'asset'] },
  { id: 'e8', kind: 'table', prompt: 'Table', rows: [{ label: 'Row 1', account: 'Cash', amount: 5, options: ['Cash', 'Debt'] }] },
];
const CASES: Array<[string, string, string, Props, number]> = [
  ['AtlasEmergencyTools', 'AtlasEmergencyTools', 'AtlasEmergencyTools', open, 150],
  ['AtlasGames', 'AtlasGames', 'AtlasGames', open, 150],
  ['AtlasTechTree', 'AtlasTechTree', 'AtlasTechTree', {}, 60], ['AtlasChessPuzzles', 'AtlasChessPuzzles', 'AtlasChessPuzzles', {}, 80], ['AtlasSudoku', 'AtlasSudoku', 'AtlasSudoku', {}, 80],
  ['AtlasSurvival', 'AtlasSurvival', 'AtlasSurvival', {}, 60], ['LowPowerCard', 'LowPowerCard', 'LowPowerCard', {}, 40], ['AddonsSection', 'AddonsSection', 'AddonsSection', {}, 40],
  ['AppPermissionsCard', 'AppPermissionsCard', 'AppPermissionsCard', {}, 40], ['ChatPinGate', 'ChatPinGate', 'ChatPinGate', (i) => ({ conversationId: i.chat }), 60],
  ['AtlasPacksSection', 'AtlasPacksSection', 'AtlasPacksSection', {}, 40], ['WebSearchSettings', 'WebSearchSettings', 'WebSearchSettings', {}, 80],
  ['ModelSelectorModal', 'ModelSelectorModal', 'ModelSelectorModal', { ...open, onSelectModel: jest.fn(), onUnloadModel: jest.fn(), isLoading: false, currentModelPath: null }, 80],
  ['ChatContextSection', 'GenerationSettingsModal/ChatContextSection', 'ChatContextSection', {}, 60],
  ['ImageQualityBasic', 'GenerationSettingsModal/ImageQualitySliders', 'ImageQualityBasicSliders', {}, 40],
  ['ImageQualityAdvanced', 'GenerationSettingsModal/ImageQualitySliders', 'ImageQualityAdvancedSliders', {}, 40],
  ['ExerciseAnswers', 'ExerciseAnswer', 'Answer', {}, 0],
];

describe('shared components survive being pressed everywhere', () => {
  it.each(CASES)('%s', async (name, file, exportName, props, presses) => {
    jest.resetModules();
    installNativeBoundary({ fs: true });
    const rtl = requireRTL();
    const React = require('react');
    const rn = require('react-native');
    try { jest.spyOn(rn.PermissionsAndroid, 'request').mockResolvedValue('granted' as never); jest.spyOn(rn.PermissionsAndroid, 'check').mockResolvedValue(true as never); jest.spyOn(rn.PermissionsAndroid, 'requestMultiple').mockResolvedValue({} as never); } catch { /* not present */ }
    const ids = seedApp();
    const Component = require(`../../../src/components/${file}`)[exportName];
    if (name === 'ExerciseAnswers') {
      const { useTheme } = require('../../../src/theme');
      const Probe = () => { const { colors } = useTheme(); return React.createElement(React.Fragment, null, ...exercises.map((ex) => React.createElement(Component, { key: ex.id, ex, value: undefined, onChange: jest.fn(), colors }))); };
      const view = rtl.render(React.createElement(Probe));
      await explore(view as never, { seed: 4, presses: 120 });
      view.unmount();
      return;
    }
    const view = rtl.render(React.createElement(Component, typeof props === 'function' ? props(ids) : props));
    for (const seed of [5, 13]) await explore(view as never, { seed, presses: Math.round(presses / 2) });
    view.unmount();
  }, 120000);
});
