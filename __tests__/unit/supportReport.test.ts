import { formatSupportReport } from '../../src/atlasTools/supportReport';
import { appLogLines, clearAppLog, noteAppLog } from '../../src/utils/appLog';
import logger from '../../src/utils/logger';

describe('the app-wide log and the report that shares it', () => {
  beforeEach(() => clearAppLog());

  it('keeps every logger line in every build, cut short, with errors and objects written out', () => {
    logger.log('[LESSON] asking', { chars: 12 });
    logger.warn('[MUSIC] reply began: x'.padEnd(2000, 'x'));
    logger.error(new Error('boom'));
    const lines = appLogLines();
    expect(lines.map((l) => l.level)).toEqual(['log', 'warn', 'error']);
    expect(lines[0].message).toBe('[LESSON] asking {"chars":12}');
    expect(lines[1].message.length).toBe(700);
    expect(lines[2].message).toBe('Error: boom');
  });

  it('puts the problems first, then the log, then the end of the last session', () => {
    noteAppLog('log', ['ordinary line']);
    noteAppLog('warn', ['[LESSON] the call failed']);
    const text = formatSupportReport({ diagnostics: 'Atlas 0.0.0', briefing: ['10:00:00 [POD] queue: intro, line 0'], lines: appLogLines(), previous: 'old 1\nold 2', now: 0 });
    const order = ['Atlas 0.0.0', 'PROBLEMS', 'BRIEFING PLAYER', 'LOG (newest', 'PREVIOUS SESSION'].map((h) => text.indexOf(h));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(text).toContain('WARN [LESSON] the call failed');
  });

  it('stays within a size that can be shared', () => {
    const lines = Array.from({ length: 3000 }, (_, i) => ({ at: i, level: 'log' as const, message: 'x'.repeat(690) }));
    expect(formatSupportReport({ diagnostics: 'd', briefing: [], lines, previous: 'p'.repeat(300_000), now: 0 }).length).toBeLessThan(260_000);
  });
});
