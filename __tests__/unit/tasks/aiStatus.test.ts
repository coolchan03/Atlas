import { aiStatusLines } from '../../../src/tasks/aiStatus';
import { aiActivity, describeNow, useAiActivity } from '../../../src/services/aiActivity';

describe('what the AI is doing', () => {
  it('says idle, a chat reply, a background job with its time and the queue behind it', () => {
    expect(describeNow({ job: null, chat: false, waiting: 0 })).toBe('Idle');
    expect(describeNow({ job: null, chat: true, waiting: 0 })).toBe('Answering a chat');
    expect(describeNow({ job: 'Teach the AI', chat: false, waiting: 2, seconds: 42 })).toBe('Teach the AI, 42 s so far (2 more waiting)');
    expect(describeNow({ job: 'Teach the AI', chat: false, waiting: 0, seconds: 2 })).toBe('Teach the AI');
    expect(describeNow({ job: null, chat: false, waiting: 1 })).toBe('Waiting for the chat to finish (1 more waiting)');
  });

  it('names the model, or says none is selected or that it is not loaded yet', () => {
    const base = { runningOn: 'HTP, 6 threads', job: null, chat: false, waiting: 0 };
    expect(aiStatusLines({ ...base, model: { name: 'Qwen', detail: 'Q4_0, 5.0 GB', loaded: true } })).toMatchObject({ model: 'Qwen (Q4_0, 5.0 GB)', runningOn: 'HTP, 6 threads' });
    expect(aiStatusLines({ ...base, model: { name: 'Qwen', detail: '', loaded: false } })).toMatchObject({ model: 'Qwen is selected but not loaded yet', runningOn: null });
    expect(aiStatusLines({ ...base, model: null }).model).toBe('No model selected');
  });

  it('counts waiting jobs and never goes below zero', () => {
    useAiActivity.setState({ running: null, waiting: 0 });
    aiActivity.queued(); aiActivity.queued();
    aiActivity.began('A', true);
    expect(useAiActivity.getState()).toMatchObject({ waiting: 1, running: { label: 'A' } });
    aiActivity.began('A', false); // a restart after a chat reply was never waiting again
    expect(useAiActivity.getState().waiting).toBe(1);
    aiActivity.ended(); aiActivity.dropped(); aiActivity.dropped();
    expect(useAiActivity.getState()).toMatchObject({ waiting: 0, running: null });
  });
});
