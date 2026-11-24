import { requireRTL } from '../harness/nativeBoundary';

jest.mock('@react-navigation/native', () => ({ ...jest.requireActual('@react-navigation/native'), useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }), useRoute: () => ({ params: {} }) }));

const reply = (body: unknown) => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => body, text: async () => JSON.stringify(body) });
const RATES = { date: '2026-11-23', rates: { EUR: 0.9, GBP: 0.8, JPY: 150, CAD: 1.4, AUD: 1.5, CHF: 0.85 } };

it('converts after the rates are fetched, keeps them with their date, lets a typed rate win, and says plainly when the phone is offline', async () => {
  const rtl = requireRTL();
  const React = require('react');
  const { CurrencyScreen } = require('../../src/currency/CurrencyScreen');
  const { useCurrency } = require('../../src/currency/store');
  useCurrency.setState({ from: 'USD', to: 'EUR', amount: '100', rates: {}, date: null, own: {} });
  const fetchSpy = jest.spyOn(global, 'fetch' as never);

  const view = rtl.render(React.createElement(CurrencyScreen));
  expect(view.getByTestId('currency-no-rate').props.children).toMatch(/No rates yet/);
  expect(view.getByTestId('currency-date').props.children).toMatch(/not on this phone/);

  // Offline: a plain sentence, and the screen still works with a typed rate.
  fetchSpy.mockRejectedValueOnce(new Error('Network request failed') as never);
  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId('currency-update')); });
  expect(view.getByTestId('currency-error').props.children).toMatch(/Could not reach the rates server/);
  rtl.fireEvent.changeText(view.getByTestId('currency-own'), '0.95');
  expect(view.getByTestId('currency-result').props.children.join('')).toBe('95.00 EUR');
  expect(view.getByTestId('currency-rate').props.children.join('')).toMatch(/your rate/);
  rtl.fireEvent.changeText(view.getByTestId('currency-own'), '');

  // Online: 100 US dollars at 0.9 is 90 euros; the date is shown; the pair swaps and crosses through the dollar.
  fetchSpy.mockResolvedValueOnce(reply(RATES) as never);
  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId('currency-update')); });
  expect(view.getByTestId('currency-result').props.children.join('')).toBe('90.00 EUR');
  expect(view.getByTestId('currency-date').props.children).toMatch(/2026-11-23/);
  expect(useCurrency.getState().rates.GBP).toBe(0.8);
  rtl.fireEvent.press(view.getByTestId('currency-swap'));
  expect(view.getByTestId('currency-result').props.children.join('')).toBe('111.11 USD');
  rtl.fireEvent.press(view.getByTestId('currency-to'));
  rtl.fireEvent.press(view.getByTestId('currency-to-GBP'));
  expect(view.getByTestId('currency-result').props.children.join('')).toBe('88.89 GBP'); // EUR to GBP: 100 / 0.9 * 0.8

  // A money without a rate says so, and an amount that is not a number is asked for again.
  rtl.fireEvent.press(view.getByTestId('currency-to'));
  rtl.fireEvent.press(view.getByTestId('currency-to-AED'));
  expect(view.getByTestId('currency-no-rate').props.children).toMatch(/no rate for EUR to AED/);
  rtl.fireEvent.changeText(view.getByTestId('currency-amount'), 'lots');
  expect(view.getByTestId('currency-need-number')).toBeTruthy();
  fetchSpy.mockRestore();
});
