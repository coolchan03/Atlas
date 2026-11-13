import { describeBackup, formatBackupReport } from '../../src/atlasTools/backupSummary';

const store = (state: object) => JSON.stringify({ state });

it('says what a backup holds, what would be restored and what is left out, and finds damage', () => {
  const report = describeBackup({ version: 2, items: {
    'local-llm-chat-storage': store({ conversations: [{}, {}] }),
    'atlas-topics': store({ courses: [{}] }),
    'atlas-exercises': store({ exercises: { a: {}, b: {}, c: {} } }),
    'atlas-search-settings': store({ apiKey: 'x' }),
    'atlas-agent-storage': '{not json',
  }, projectFiles: [{ size: 3 * 1048576 }, { size: 1048576 }] });
  expect(report.lines).toEqual(['2 chats', '1 course', '3 practice questions', '2 project documents (4 MB)']);
  expect(report.restorable).toBe(4);
  expect(report.skipped).toEqual(['atlas-search-settings']);
  expect(report.problems).toEqual(['atlas-agent-storage is damaged and would be skipped.']);
  expect(formatBackupReport(report)).toContain('Nothing was changed on this phone.');
});

it('says so when nothing can be restored', () => {
  expect(describeBackup({ version: 1, items: { whatever: '{}' } }).problems).toContain('Nothing in this file can be restored.');
});
