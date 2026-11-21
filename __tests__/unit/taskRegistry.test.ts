import { canStartNow, displayTitle, progressPercent, trackTask, useTasks } from '../../src/tasks/taskRegistry';

const reset = () => useTasks.setState({ tasks: [] });
beforeEach(reset);

describe('UX-13 task registry', () => {
  it('shows a percentage only when the total is known', () => {
    expect(progressPercent({ completed: 3, total: 12 })).toBe(25);
    expect(progressPercent({ completed: 3 })).toBeNull();
    expect(progressPercent({ completed: 0, total: 0 })).toBeNull();
  });
  it('runs one heavy job at a time and queues the next', () => {
    const a = useTasks.getState().start({ type: 'zip', title: 'Big zip' });
    const b = useTasks.getState().start({ type: 'index', title: 'Index' });
    const c = useTasks.getState().start({ type: 'download', title: 'Model' });
    const by = (id: string) => useTasks.getState().tasks.find((t) => t.id === id)!.status;
    expect([by(a), by(b), by(c)]).toEqual(['running', 'queued', 'running']);
    expect(canStartNow(useTasks.getState().tasks, 'audio')).toBe(false);
  });
  it('a job running when the app was killed shows as interrupted, never as running', () => {
    const id = useTasks.getState().start({ type: 'import', title: 'Files' });
    useTasks.getState().markInterrupted();
    const t = useTasks.getState().tasks.find((x) => x.id === id)!;
    expect(t.status).toBe('interrupted'); expect(t.retryable).toBe(false); expect(t.error).toMatch(/not duplicated/);
  });
  it('a failed job stays until dismissed, and a running job cannot be dismissed', () => {
    const run = useTasks.getState().start({ type: 'import', title: 'A' });
    const bad = useTasks.getState().start({ type: 'other', title: 'B' });
    useTasks.getState().fail(bad, 'Broken PDF');
    useTasks.getState().dismiss(run);
    expect(useTasks.getState().tasks.map((t) => t.id).sort()).toEqual([run, bad].sort());
    useTasks.getState().dismiss(bad);
    expect(useTasks.getState().tasks.map((t) => t.id)).toEqual([run]);
  });
  it('a protected project name is never shown', () => {
    expect(displayTitle({ title: 'Adding files to Taxes 2026', protectedScope: true })).toBe('Protected item');
    expect(displayTitle({ title: 'Adding files to Notes' })).toBe('Adding files to Notes');
  });
  it('cancel stops at a safe point and is never reported as done; retry runs the same work again', async () => {
    let runs = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const p = trackTask({ type: 'import', title: 'Import', retryable: true }, async (ctl) => { runs++; await gate; if (ctl.cancelled()) return 'partial'; return 'ok'; });
    const id = useTasks.getState().tasks[0].id;
    useTasks.getState().cancel(id);
    release(); await p;
    expect(useTasks.getState().tasks[0].status).toBe('cancelled');
    expect(useTasks.getState().retry(id)).toBe(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(runs).toBe(2);
    expect(useTasks.getState().tasks[0].status).toBe('done');
  });
  it('a throw becomes a visible failure; retry works only while the app is alive', async () => {
    await expect(trackTask({ type: 'import', title: 'X', retryable: true }, async () => { throw new Error('parser crashed'); })).rejects.toThrow();
    const t = useTasks.getState().tasks[0];
    expect(t).toMatchObject({ status: 'failed', retryable: true, error: 'parser crashed' });
    useTasks.setState({ tasks: [{ ...t, id: 'ghost' }] });
    expect(useTasks.getState().retry('ghost')).toBe(false); // no live runner (the app restarted)
  });
});
