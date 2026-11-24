import { requireRTL } from '../harness/nativeBoundary';

jest.mock('@react-navigation/native', () => ({ ...jest.requireActual('@react-navigation/native'), useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }) }));
jest.mock('@react-native-documents/picker', () => ({ pick: jest.fn(async () => [{ uri: 'file:///docs/policy.pdf', name: 'policy.pdf' }]), types: { allFiles: '*/*' }, isErrorWithCode: () => false, errorCodes: {} }));
const mockText = { value: '' };
jest.mock('../../src/services/documentService', () => ({ documentService: { textFromPicked: async () => mockText.value } }));
const mockShaped = jest.fn();
jest.mock('../../src/study/engine', () => ({ askShaped: (...a: unknown[]) => mockShaped(...a), askModel: jest.fn() }));
// The embedding model is native: a stand-in that turns a text into a count of its words.
jest.mock('../../src/services/rag/embedding', () => ({
  embeddingService: {
    load: async () => undefined,
    embed: async (text: string) => { const v = new Array(256).fill(0); for (const w of text.toLowerCase().match(/[a-z]+/g) ?? []) { let h = 0; for (const c of w) h = (h * 31 + c.charCodeAt(0)) % 256; v[h] += 1; } return v; },
  },
}));

const filler = (n: number) => Array.from({ length: n }, (_, i) => `Section ${i} describes how the warehouse stores boxes on shelves and how the staff count the boxes at the end of each week.`).join('\n\n');
const DOC = `${filler(20)}\n\nReturns. A refund for a damaged parcel is paid within five working days after the parcel is returned to the warehouse.\n\n${filler(20)}\n\nShipping. Parcels are sent every Tuesday and Friday from the warehouse by road.\n\n${filler(20)}`;

it('reads one long document once, answers a specific question from the closest passages with their numbers, answers a summary from notes on the whole of it, and says plainly when the AI cannot', async () => {
  const rtl = requireRTL();
  const React = require('react');
  const { DocumentQAScreen } = require('../../src/docqa/DocumentQAScreen');
  mockText.value = DOC;
  const view = rtl.render(React.createElement(DocumentQAScreen));
  expect(view.queryByTestId('docqa-question')).toBeNull();

  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId('docqa-choose')); });
  expect(await view.findByTestId('docqa-name')).toBeTruthy();
  expect(view.getByTestId('docqa-name').props.children).toBe('policy.pdf');

  // A specific question: only the passage about refunds is shown to the model.
  mockShaped.mockResolvedValueOnce('A refund is paid within five working days of the return [1].');
  rtl.fireEvent.changeText(view.getByTestId('docqa-question'), 'How many days until a refund for a damaged parcel is paid?');
  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId('docqa-ask')); });
  const [system, user, shape] = mockShaped.mock.calls[0];
  expect(system).toMatch(/using only the numbered passages/);
  expect(user).toMatch(/refund for a damaged parcel is paid within five working days/);
  expect(user).not.toMatch(/every Tuesday and Friday/);
  expect(shape.label).toBe('Answering from the document');
  expect(view.getByText(/A refund is paid within five working days/)).toBeTruthy();
  const chip = view.getAllByTestId(/^docqa-passage-0-\d+$/)[0];
  rtl.fireEvent.press(chip);
  expect(view.getByTestId('docqa-passage-text').props.children).toMatch(/refund for a damaged parcel/);

  // A summary needs the whole document: it is read in parts, then the answer is written from the notes.
  mockShaped.mockReset();
  mockShaped.mockImplementation(async (_s: string, u: string, s: { label: string }) => (/^Reading part/.test(s.label) ? 'The part is about the warehouse.' : `A summary from ${/Notes from the whole document/.test(u) ? 'notes' : 'nothing'}.`));
  rtl.fireEvent.changeText(view.getByTestId('docqa-question'), 'Summarise the document');
  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId('docqa-ask')); });
  const labels = mockShaped.mock.calls.map((c) => c[2].label);
  expect(labels.filter((l: string) => /^Reading part/.test(l)).length).toBeGreaterThan(2);
  expect(labels[labels.length - 1]).toBe('Answering from the whole document');
  expect(view.getByText('A summary from notes.')).toBeTruthy();
  expect(view.getByText('Written from notes on the whole document.')).toBeTruthy();

  // The AI cannot answer: a plain sentence, and the screen carries on.
  mockShaped.mockReset();
  mockShaped.mockRejectedValue(new Error('No model loaded'));
  rtl.fireEvent.changeText(view.getByTestId('docqa-question'), 'Which days are parcels sent from the warehouse by road?');
  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId('docqa-ask')); });
  expect(view.getByText(/The AI could not answer: No model loaded/)).toBeTruthy();

  // Nothing in the document comes near the question: it says so without asking the AI.
  mockShaped.mockReset();
  rtl.fireEvent.changeText(view.getByTestId('docqa-question'), 'zzzz qqqq xxxx');
  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId('docqa-ask')); });
  expect(view.getByText('I could not find anything about that in the document.')).toBeTruthy();
  expect(mockShaped).not.toHaveBeenCalled();
});

it('says there is hardly any text, and refuses a document that is too long to search', async () => {
  const rtl = requireRTL();
  const React = require('react');
  const { DocumentQAScreen } = require('../../src/docqa/DocumentQAScreen');
  mockText.value = 'tiny';
  const view = rtl.render(React.createElement(DocumentQAScreen));
  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId('docqa-choose')); });
  expect(view.getByTestId('docqa-error').props.children).toMatch(/hardly any text/);
  mockText.value = 'A long sentence about nothing in particular. '.repeat(8000); // far more than 400 passages
  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId('docqa-choose')); });
  expect(view.getByTestId('docqa-error').props.children).toMatch(/too long to search here/);
});
