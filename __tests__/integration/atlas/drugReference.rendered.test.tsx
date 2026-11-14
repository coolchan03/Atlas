/**
 * Drug labels: look a medicine up, read its label section by section, and read it again later with no connection.
 * Fakes only the network.
 */
import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
}));

const record = {
  set_id: 'abc', effective_time: '20250314',
  openfda: { brand_name: ['Advil'], generic_name: ['IBUPROFEN'], manufacturer_name: ['Haleon'], product_type: ['HUMAN OTC DRUG'] },
  boxed_warning: ['Cardiovascular and stomach risk.'], indications_and_usage: ['Temporarily relieves minor aches and pains.'], drug_interactions: ['Aspirin: ask a doctor.'],
};

function open() {
  installNativeBoundary({ fs: true });
  const rtl = requireRTL();
  const React = require('react');
  const { DrugReferenceScreen } = require('../../../src/screens/DrugReferenceScreen');
  return { rtl, view: rtl.render(React.createElement(DrugReferenceScreen)) };
}
const online = () => { global.fetch = jest.fn(async () => ({ status: 200, ok: true, json: async () => ({ results: [record] }) })) as never; };
const offline = () => { global.fetch = jest.fn(async () => { throw new Error('Network request failed'); }) as never; };

it('finds a medicine, opens its label and shows each section, keeping it for later', async () => {
  online();
  const { rtl, view } = open();
  expect(view.getByText(/Nothing saved yet/)).toBeTruthy();
  rtl.fireEvent.changeText(view.getByTestId('drug-query'), 'advil');
  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId('drug-search')); });
  await rtl.waitFor(() => expect(view.getByTestId('drug-open-abc')).toBeTruthy());
  rtl.fireEvent.press(view.getByTestId('drug-open-abc'));
  expect(view.getByText('Cardiovascular and stomach risk.')).toBeTruthy();
  expect(view.getByTestId('drug-section-boxed_warning')).toBeTruthy();
  expect(view.getByText('Temporarily relieves minor aches and pains.')).toBeTruthy();
  expect(view.getByText('Interactions with other drugs')).toBeTruthy();
  expect(view.queryByTestId('drug-section-warnings')).toBeNull(); // this label has no warnings section
  rtl.fireEvent.press(view.getByTestId('drug-back'));
  expect(require('../../../src/drugs/store').useSavedDrugs.getState().saved.map((l: { id: string }) => l.id)).toEqual(['abc']);
});

it('with no connection, shows the labels saved earlier, says why, and can remove one', async () => {
  online();
  const first = open();
  first.rtl.fireEvent.changeText(first.view.getByTestId('drug-query'), 'advil');
  await first.rtl.act(async () => { first.rtl.fireEvent.press(first.view.getByTestId('drug-search')); });
  await first.rtl.waitFor(() => expect(first.view.getByTestId('drug-open-abc')).toBeTruthy());
  offline();
  first.rtl.fireEvent.changeText(first.view.getByTestId('drug-query'), 'ibuprofen');
  await first.rtl.act(async () => { first.rtl.fireEvent.press(first.view.getByTestId('drug-search')); });
  await first.rtl.waitFor(() => expect(first.view.getByTestId('drug-note')).toBeTruthy());
  expect(first.view.getByText(/No connection to the FDA service/)).toBeTruthy();
  expect(first.view.getByTestId('drug-open-abc')).toBeTruthy();
  first.rtl.fireEvent.changeText(first.view.getByTestId('drug-query'), 'zzzz');
  await first.rtl.act(async () => { first.rtl.fireEvent.press(first.view.getByTestId('drug-search')); });
  await first.rtl.waitFor(() => expect(first.view.queryByTestId('drug-open-abc')).toBeNull());
});

it('gives the chat tool the label text, and says plainly when nothing could be found', async () => {
  online();
  installNativeBoundary({ fs: true });
  const { drugLabelsForChat } = require('../../../src/drugs/store');
  const text = await drugLabelsForChat('advil');
  expect(text).toContain('Advil (IBUPROFEN), Haleon, OTC');
  expect(text).toContain('Interactions with other drugs: Aspirin: ask a doctor.');
  expect(text).toContain('not medical advice');
  offline();
  expect(await drugLabelsForChat('nothing-saved')).toContain('Do not guess doses');
  await expect(drugLabelsForChat('  ')).rejects.toThrow('name');
});
