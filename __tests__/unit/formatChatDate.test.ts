import { formatChatDate } from '../../src/utils/formatChatDate';

const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min);

describe('the date beside a chat', () => {
  const now = at(2026, 11, 21, 8, 0);

  it('shows a time for today', () => {
    expect(formatChatDate(at(2026, 11, 21, 7, 30), now)).toMatch(/\d{1,2}:\d{2}/);
  });

  it('says Yesterday for last night, even when it was under 24 hours ago', () => {
    expect(formatChatDate(at(2026, 11, 20, 23, 0), now)).toBe('Yesterday'); // 9 hours ago, but on the calendar day before
    expect(formatChatDate(at(2026, 11, 20, 0, 5), now)).toBe('Yesterday');
  });

  it('does not call a message from earlier today Yesterday', () => {
    expect(formatChatDate(at(2026, 11, 21, 0, 5), now)).not.toBe('Yesterday');
  });

  it('shows the weekday within a week and month and day after that', () => {
    expect(formatChatDate(at(2026, 11, 17), now)).toMatch(/^[A-Za-z]{3,}/);
    expect(formatChatDate(at(2026, 11, 17), now)).not.toMatch(/\d/);
    expect(formatChatDate(at(2026, 11, 1), now)).toMatch(/\d/);
  });

  it('shows a time, not Yesterday, for a time in the future, and nothing for one that cannot be read', () => {
    expect(formatChatDate(at(2026, 11, 22, 9, 0), now)).toMatch(/\d{1,2}:\d{2}/);
    expect(formatChatDate('not a date', now)).toBe('');
  });
});
