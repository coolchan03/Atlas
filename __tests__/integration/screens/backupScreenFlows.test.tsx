import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';
import { explore } from '../../harness/monkey';
import { seedApp } from '../../harness/monkeySeed';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: () => () => undefined }),
  useRoute: () => ({ params: {} }),
}));

type Outcome = 'saved' | 'cancelled-null' | 'cancelled-throw' | 'fails';

async function setup(outcome: Outcome, opts: { locked?: number; lastBackup?: number } = {}) {
  jest.resetModules();
  installNativeBoundary({ fs: true });
  const rtl = requireRTL();
  const React = require('react');
  seedApp('full');
  const run = async (ok: unknown) => {
    if (outcome === 'cancelled-null') return null;
    if (outcome === 'cancelled-throw') throw new Error('User cancelled');
    if (outcome === 'fails') throw new Error('disk is full');
    return ok;
  };
  jest.doMock('../../../src/atlasTools/backup', () => ({
    lockedChatsNotOpen: () => opts.locked ?? 0, exportBackup: jest.fn(async () => run('backup.atlasbackup')), importBackup: jest.fn(async () => run(12)), checkBackup: jest.fn(async () => run('3 projects, 5 chats')),
  }));
  if (opts.lastBackup) require('../../../src/atlasTools/backupReminder').useBackupReminder.setState({ lastBackupAt: opts.lastBackup });
  const { BackupScreen } = require('../../../src/screens/BackupScreen');
  const view = rtl.render(React.createElement(BackupScreen));
  return { view, rtl };
}

describe('backup and sync screen', () => {
  it.each([
    ['saved', 'saved', {}],
    ['saved with locked chats', 'saved', { locked: 2 }],
    ['saved with one locked chat and an old backup', 'saved', { locked: 1, lastBackup: Date.now() - 40 * 86400000 }],
    ['cancelled by a null result', 'cancelled-null', {}],
    ['cancelled by an error', 'cancelled-throw', {}],
    ['failing', 'fails', {}],
  ] as Array<[string, Outcome, { locked?: number; lastBackup?: number }]>)('works through every action when the backup is %s', async (_name, outcome, opts) => {
    const { view } = await setup(outcome, opts);
    const passwords = ['a-long-enough-password-1', 'short', 'another-long-password-22'];
    for (const seed of [3, 9, 21, 34]) await explore(view as never, { seed, presses: 70, text: passwords });
    view.unmount();
  }, 120000);
});
