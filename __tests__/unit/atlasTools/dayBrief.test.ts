import { daySpoken } from '../../../src/atlasTools/dayBrief';
import type { ScheduledTask } from '../../../src/schedule/store';

const task = (over: Partial<ScheduledTask>): ScheduledTask => ({ id: 't', name: 'Task', kind: 'prompt', prompt: 'x', repeat: 'daily', hour: 15, minute: 0, enabled: true, createdAt: 0, ...over });
const morning = new Date(2026, 10, 19, 7, 30).getTime();

describe('the briefing "your day" line', () => {
  it('names the tasks that run later today, in time order, and skips briefings and switched-off tasks', () => {
    const text = daySpoken({ now: morning, tasks: [
      task({ name: 'Study quiz', hour: 18 }), task({ name: 'Stretch', hour: 12, minute: 30 }), task({ name: 'The briefing', kind: 'briefing', hour: 8 }), task({ name: 'Off', enabled: false, hour: 9 }),
    ] });
    expect(text).toMatch(/^Later today, Atlas has Stretch at 12:30.*, and Study quiz at 6:00.*scheduled\.$/);
    expect(text).not.toContain('briefing');
    expect(text).not.toContain('Off');
  });

  it('leaves out tasks that are tomorrow or later, and one that already passed today', () => {
    expect(daySpoken({ now: morning, tasks: [task({ name: 'Weekly', repeat: 'once', onceAt: morning + 2 * 864e5 }), task({ name: 'Past', repeat: 'once', onceAt: morning - 3600e3 })] })).toBe('');
  });

  it('adds a charge reminder only when the battery is low and not charging', () => {
    expect(daySpoken({ now: morning, tasks: [], batteryPercent: 24, charging: false })).toBe('Your phone is at 24 percent, so charge it before a long day.');
    expect(daySpoken({ now: morning, tasks: [], batteryPercent: 24, charging: true })).toBe('');
    expect(daySpoken({ now: morning, tasks: [], batteryPercent: 80 })).toBe('');
    expect(daySpoken({ now: morning, tasks: [], batteryPercent: null })).toBe('');
  });

  it('says at most four tasks and counts the rest', () => {
    const many = Array.from({ length: 6 }, (_, i) => task({ id: `t${i}`, name: `Job ${i}`, hour: 9 + i }));
    expect(daySpoken({ now: morning, tasks: many })).toContain(', and 2 more scheduled.');
  });
});
