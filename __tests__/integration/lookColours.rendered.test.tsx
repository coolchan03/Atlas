import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
jest.mock('@react-navigation/native', () => ({ ...jest.requireActual('@react-navigation/native'), useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), getParent: () => ({ navigate: jest.fn() }) }), useFocusEffect: () => undefined }));
const normalize = require('@react-native/normalize-colors');
import { AppearanceScreen } from '../../src/screens/AppearanceScreen';
import { QuickHomeScreen } from '../../src/screens/HomeScreen/QuickHome';
import { PALETTES, ACCENTS, SKINS, LAYOUT_MODES } from '../../src/theme/appearance';

const COLOR_PROPS = /color$/i;
function badColors(node: any, out: Set<string>) {
  const flat = (s: any): any => (Array.isArray(s) ? Object.assign({}, ...s.map(flat)) : s && typeof s === 'object' ? s : {});
  const st = flat(node.props?.style);
  for (const [k, v] of Object.entries(st)) if (COLOR_PROPS.test(k) && typeof v === 'string' && normalize(v) == null) out.add(`${k}=${v}`);
  for (const [k, v] of Object.entries(node.props ?? {})) if (/color/i.test(k) && typeof v === 'string' && normalize(v) == null) out.add(`prop ${k}=${v}`);
  (node.children ?? []).forEach((c: any) => typeof c === 'object' && badColors(c, out));
}
it('no built-in skin, palette, accent or layout gives a colour Android cannot read', () => {
  const bad = new Set<string>();
  const view = render(<AppearanceScreen />);
  const check = () => { badColors(view.toJSON(), bad); };
  const press = (id: string) => { try { fireEvent.press(view.getByTestId(id)); } catch { /* not on screen */ } };
  press('fold-colors');
  for (const id of [...SKINS.map((s) => `skin-${s.id}`), ...PALETTES.map((p) => `palette-${p.id}`), ...ACCENTS.map((a) => `accent-${a.id}`), ...LAYOUT_MODES.map((l) => `layout-mode-${l.id}`), 'theme-mode-light', 'theme-mode-dark', ...Array(25).fill('look-surprise')]) { press(id); check(); }
  for (const l of LAYOUT_MODES) { const h = render(<QuickHomeScreen navigation={{ navigate: jest.fn(), getParent: () => ({ navigate: jest.fn() }) }} mode={l.id as any} />); badColors(h.toJSON(), bad); h.unmount(); }
  expect([...bad].slice(0, 15)).toEqual([]);
});
