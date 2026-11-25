/** After a night's run, the Teach the AI screen says what the subject gained since the person last looked, and "Mark as read" starts it again. Real database. */
import { installRealSqlite } from '../../harness/sqliteFake';
import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';

it('shows what was gained since the last look, and clears it when marked as read', () => {
  installNativeBoundary({ fs: true });
  installRealSqlite();
  const rtl = requireRTL();
  const React = require('react');
  const { learningKnowledgeDb: db } = require('../../../src/learning/knowledgeDb');
  const { useLearningStore } = require('../../../src/learning/store');
  const { LearningDigestCard } = require('../../../src/screens/LearningDigestCard');
  const base = Date.now() - 3600_000;
  for (let n = 0; n < 5; n += 1) db.archiveReport('tax', { id: `r${n}`, itemId: `i${n}`, q: `Question ${n}`, text: `Report ${n}`, sources: '', at: base + n, status: n < 4 ? 'pass' : 'fail' });
  db.saveCandidate({ id: 'c1', topic: 'tax', question: 'Question 0', claimText: 'The standard deduction for 2025 is a set amount.', reportId: 'r0', status: 'candidate', uncertainty: '', sources: [{ id: 's1', kind: 'web', title: 'IRS Publication 17', sourceType: 'official', authority: 'primary' }], citedNumbers: [1] });
  const view = rtl.render(React.createElement(LearningDigestCard, { agentId: 'tax', changed: 1 }));
  expect(view.getByText(/5 new reports: 4 passed the judge, 1 did not/)).toBeTruthy();
  expect(view.getByText(/1 new fact saved/)).toBeTruthy();
  expect(view.getByText(/Newest: The standard deduction/)).toBeTruthy();
  rtl.fireEvent.press(view.getByTestId('learning-digest-seen'));
  expect(useLearningStore.getState().looked.tax).toBeGreaterThan(base);
  expect(view.queryByTestId('learning-digest')).toBeNull(); // nothing new since
});
