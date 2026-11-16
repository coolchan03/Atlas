/** The "Where this came from" part of a lesson as the learner sees it: sources with their places, the quoted sentence, and lines no source backs. */
import { installNativeBoundary, requireRTL } from '../harness/nativeBoundary';

it('shows each source with its page, opens the passage with the quoted sentence marked, and lists what no source backs', async () => {
  installNativeBoundary({ fs: true });
  require('../../src/atlasTools/offGridState').useOffGrid.setState({ on: true }); // no web search: "check these lines" says it could not check
  const rtl = requireRTL();
  const React = require('react');
  const { CitedFold, RewriteRow } = require('../../src/topics/CitedFold');
  const lesson = { kind: 'lesson', sections: [{ heading: 'H', text: 'The lessee records a right-of-use asset and a lease liability at commencement. The discount rate must always equal 7.5 percent for every private company lease contract.' }], keyPoints: [] };
  const passages = [
    { source: 'Intermediate Accounting', where: 'page 214', text: 'Leases are common. A lessee records a right-of-use asset and a lease liability at commencement. Other things follow.' },
    { source: 'Leases explained', url: 'https://example.org/leases', text: 'A lease transfers the right to use an asset for a period of time.' },
  ];
  const picked: string[] = [];
  const view = rtl.render(React.createElement(React.Fragment, null,
    React.createElement(RewriteRow, { show: true, onPick: (h: string) => picked.push(h) }),
    React.createElement(CitedFold, { passages, content: lesson })));
  // Sources are one quiet line until asked for.
  expect(view.queryByText('Intermediate Accounting, page 214')).toBeNull();
  expect(view.getByText('Sources (2)')).toBeTruthy();
  rtl.fireEvent.press(view.getByTestId('square-sources-toggle'));
  expect(view.getByText('Intermediate Accounting, page 214')).toBeTruthy();
  expect(view.getByText('Leases explained')).toBeTruthy();
  expect(view.getByTestId('square-unbacked')).toBeTruthy();
  expect(view.getByText(/must always equal 7.5 percent/)).toBeTruthy();
  rtl.fireEvent.press(view.getByTestId('square-cited-toggle'));
  expect(view.getAllByTestId('square-quoted')[0].props.children).toBe('A lessee records a right-of-use asset and a lease liability at commencement.');
  rtl.fireEvent.press(view.getByTestId('square-source-open'));
  expect(view.getByTestId('square-source-page')).toBeTruthy();
  rtl.fireEvent.press(view.getByTestId('square-rewrite-simpler'));
  expect(picked).toEqual(['simpler']);
  // Check these lines: with no project and no web search the answer is "could not check", and it goes when the lesson is written again.
  rtl.fireEvent.press(view.getByTestId('square-check-lines'));
  await rtl.waitFor(() => expect(view.getByTestId('line-verdict-0')).toBeTruthy());
  expect(view.getByText(/Could not check/)).toBeTruthy();
  const again = { ...lesson, sections: [{ heading: 'H', text: 'The reporting rate must always equal 99.5 percent for every private company filing in every state.' }] };
  view.rerender(React.createElement(React.Fragment, null,
    React.createElement(RewriteRow, { show: true, onPick: () => undefined }),
    React.createElement(CitedFold, { passages, content: again })));
  expect(view.queryByTestId('line-verdict-0')).toBeNull();
});
