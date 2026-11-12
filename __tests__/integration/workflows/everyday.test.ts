/** Meeting follow-ups and bill reminders on the workflow engine. Only the AI is faked; reminders go into the real schedule store. */
import { advance, approve, newRun } from '../../../src/workflows/engine';
import { bill, meeting, realDate, readBill, readMeeting } from '../../../src/workflows/everyday';

const TRANSCRIPT = 'Sam: We agreed the launch is moving to the end of the month. Priya will send the revised budget by 2026-03-04 and Sam will book the venue. '.repeat(2);

it('turns a transcript into a note, and sets a reminder only for the item with a real date, after approval', async () => {
  const { useSchedule } = require('../../../src/schedule/store');
  useSchedule.setState({ tasks: [] });
  const ask = jest.fn(async () => '{"summary":"Launch moves to month end.","actions":[{"text":"Priya sends the revised budget","due":"2026-03-04"},{"text":"Sam books the venue","due":"2026-02-30"}]}');
  let run = await advance(meeting, newRun(meeting, 'm1', { transcript: TRANSCRIPT, title: 'Launch sync' }), { ask });
  expect(run.status).toBe('waiting');
  expect(run.waiting?.summary).toMatch(/Priya sends the revised budget \(by 2026-03-04\)/);
  expect(run.waiting?.summary).toMatch(/- Sam books the venue\n/); // 30 February is not a date, so no "by"
  expect(useSchedule.getState().tasks).toHaveLength(0); // nothing is scheduled before approval
  run = await approve(meeting, run, { ask });
  expect(run.status).toBe('done');
  expect(run.ctx.reminders).toBe(1);
  expect(useSchedule.getState().tasks).toHaveLength(1);
  expect(useSchedule.getState().tasks[0]).toMatchObject({ repeat: 'once', kind: 'prompt' });
  expect(run.ctx.note).toContain('- [ ] Priya sends the revised budget (by 2026-03-04)');
});

it('refuses a transcript that is too short and a reply with no summary', async () => {
  const short = await advance(meeting, newRun(meeting, 'm2', { transcript: 'hi', title: 't' }), { ask: jest.fn() });
  expect(short.error).toMatch(/too short/);
  expect(() => readMeeting('{"actions":[]}')).toThrow(/did not return a summary/);
});

it('reads a bill, shows it, and schedules a reminder ahead of the due date', async () => {
  const { useSchedule } = require('../../../src/schedule/store');
  useSchedule.setState({ tasks: [] });
  const ask = jest.fn(async () => 'Here: {"vendor":"City Power","amount":"$142.60","due":"2999-06-15","kind":"bill"}');
  let run = await advance(bill, newRun(bill, 'b1', { text: 'City Power invoice...', reminderDays: 3 }), { ask });
  expect(run.waiting?.summary).toMatch(/Bill from City Power, 142.60, due 2999-06-15/);
  run = await approve(bill, run, { ask });
  expect(run.ctx.reminded).toBe(true);
  expect(useSchedule.getState().tasks[0].name).toBe('City Power bill');
  expect(new Date(useSchedule.getState().tasks[0].onceAt).getDate()).toBe(12);
});

it('says exactly what is missing instead of guessing', () => {
  expect(() => readBill('{"vendor":"A","amount":5}')).toThrow(/No due or expiry date/);
  expect(() => readBill('{"amount":5,"due":"2026-01-01"}')).toThrow(/No company name/);
  expect(() => readBill('{"vendor":"A","due":"2026-01-01"}')).toThrow(/No amount/);
  expect(readBill('{"vendor":"Acme","due":"2027-01-01","kind":"warranty"}')).toMatchObject({ kind: 'warranty', cents: 0 });
  expect(realDate('2026-02-30')).toBeUndefined();
});
