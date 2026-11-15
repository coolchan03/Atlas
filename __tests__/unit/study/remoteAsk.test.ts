import { providerRegistry } from '../../../src/services/providers';
import { useRemoteServerStore } from '../../../src/stores';
import { askRemote } from '../../../src/study/remoteAsk';

const fake = (behave: 'ok' | 'fail' | 'throw' | 'empty') => ({
  capabilities: {}, generate: jest.fn(async (_m: unknown, opts: { maxTokens: number }, cb: any) => {
    if (behave === 'throw') throw new Error('unreachable'); // rejects without calling onError
    if (behave === 'empty') { cb.onComplete({ content: '' }); return; }
    if (behave === 'fail') { cb.onError(new Error('server down')); return; }
    cb.onToken('A lesson'); cb.onComplete({ content: `A lesson (max ${opts.maxTokens})` });
  }),
});

describe('lessons written by the chosen server model', () => {
  afterEach(() => { providerRegistry.unregisterProvider('srv'); useRemoteServerStore.setState({ activeServerId: null, activeRemoteTextModelId: null } as any); });
  it('gives up (the phone model is used) when the server rejects without a callback, or answers with nothing', async () => {
    useRemoteServerStore.setState({ activeServerId: 'srv', activeRemoteTextModelId: 'big' } as any);
    providerRegistry.registerProvider('srv', fake('throw') as any);
    expect(await askRemote('s', 'u')).toBeNull();
    providerRegistry.unregisterProvider('srv');
    providerRegistry.registerProvider('srv', fake('empty') as any);
    expect(await askRemote('s', 'u')).toBeNull();
  });
  it('uses nothing when no server model is active', async () => {
    expect(await askRemote('s', 'u')).toBeNull();
  });
  it('uses the active server model with room for a whole lesson, and gives up quietly (the phone model is used) when the server fails', async () => {
    providerRegistry.registerProvider('srv', fake('ok') as any);
    useRemoteServerStore.setState({ activeServerId: 'srv', activeRemoteTextModelId: 'big' } as any);
    expect(await askRemote('s', 'u')).toMatch(/A lesson \(max \d{4,}\)/);
    providerRegistry.unregisterProvider('srv');
    providerRegistry.registerProvider('srv', fake('fail') as any);
    expect(await askRemote('s', 'u')).toBeNull();
  });
});
