/** Offline packs you already have: a newer edition on the Kiwix server is offered as an Update. Fakes only the network and storage. */
import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';

it('knows a later edition from the dates in the file names', () => {
  installNativeBoundary({ fs: true });
  const { zimStamp, isNewerZim } = require('../../../src/atlasTools/addons');
  expect(zimStamp('wikipedia_en_medicine_maxi_2025-01.zim')).toBe(202501);
  expect(zimStamp('notes.txt')).toBe(0);
  expect(isNewerZim('/zim/x_en_2025-01.zim', 'x_en_2025-06.zim')).toBe(true);
  expect(isNewerZim('/zim/x_en_2025-06.zim', 'x_en_2025-06.zim')).toBe(false);
  expect(isNewerZim('/zim/x_en_2026-01.zim', 'x_en_2025-06.zim')).toBe(false);
  expect(isNewerZim('/zim/odd-name.zim', 'x_en_2025-06.zim')).toBe(false);
});

it('offers Update for an installed pack with a later edition, and not for one that is current or missing', async () => {
  installNativeBoundary({ fs: true });
  const rtl = requireRTL();
  const React = require('react');
  const RNFS = require('react-native-fs');
  const addons = require('../../../src/atlasTools/addons');
  await RNFS.mkdir(addons.addonDir());
  await RNFS.writeFile(`${addons.addonDir()}/wikem_en_all_maxi_2024-01.zim`, 'x', 'utf8'); // older than the server's
  await RNFS.writeFile(`${addons.addonDir()}/zimgit-water_en_2025-03.zim`, 'x', 'utf8'); // already the newest
  global.fetch = jest.fn(async (url: string) => ({
    ok: true,
    text: async () => (String(url).includes('/other/')
      ? '<a href="wikem_en_all_maxi_2025-06.zim">a</a>   40M\n<a href="wikem_en_all_maxi_2024-01.zim">a</a>   39M\n<a href="zimgit-water_en_2025-03.zim">a</a>   20M\n'
      : ''),
  })) as never;
  const { AddonsSection } = require('../../../src/components/AddonsSection');
  const view = rtl.render(React.createElement(AddonsSection));
  await rtl.waitFor(() => expect(view.getByTestId('addon-update-wikem')).toBeTruthy());
  expect(view.queryByTestId('addon-update-water')).toBeNull();
  expect(view.queryByTestId('addon-update-knots')).toBeNull();
});
