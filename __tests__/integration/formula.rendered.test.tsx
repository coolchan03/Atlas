import { requireRTL } from '../harness/nativeBoundary';

jest.mock('@react-navigation/native', () => ({ ...jest.requireActual('@react-navigation/native'), useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }), useRoute: () => ({ params: {} }) }));
const mockAsk = jest.fn();
jest.mock('../../src/study/engine', () => ({ askShaped: (...a: unknown[]) => mockAsk(...a) }));

it('writes a formula, works it out on the pasted rows, retries once with the reason when it cannot be read, and re-evaluates an edit', async () => {
  const rtl = requireRTL();
  const React = require('react');
  const { FormulaScreen } = require('../../src/formulas/FormulaScreen');
  const view = rtl.render(React.createElement(FormulaScreen));
  rtl.fireEvent.changeText(view.getByTestId('formula-sample'), 'Item,Status,Amount\nRent,paid,900\nFood,due,250\nGas,paid,1200.5');
  rtl.fireEvent.changeText(view.getByTestId('formula-request'), 'total of the amounts that are paid');

  // First reply uses a function the checker does not know; the second try is told why and gets it right.
  mockAsk.mockResolvedValueOnce('=SUMIFS(C2:C4,B2:B4,"paid")').mockResolvedValueOnce('=SUMIF(B2:B4,"paid",C2:C4)');
  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId('formula-write')); });
  expect(mockAsk.mock.calls[1][1]).toMatch(/SUMIFS is not a function this checker knows/);
  expect(view.getByTestId('formula-text').props.value).toBe('=SUMIF(B2:B4,"paid",C2:C4)');
  expect(view.getByTestId('formula-answer').props.children).toBe('Answer on your rows: 2100.5');

  // Editing the formula changes the answer at once; a mistake is explained, never answered.
  rtl.fireEvent.changeText(view.getByTestId('formula-text'), '=COUNTIF(B2:B4,"paid")*10+IFERROR(1/0,5)');
  expect(view.getByTestId('formula-answer').props.children).toBe('Answer on your rows: 25');
  rtl.fireEvent.changeText(view.getByTestId('formula-text'), '=A1/0');
  expect(view.getByTestId('formula-answer').props.children).toMatch(/not a number|divides by zero/);
});
