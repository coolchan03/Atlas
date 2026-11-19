import { installNativeBoundary } from '../harness/nativeBoundary';

describe('what a call button says while it gets ready', () => {
  function setup(opts: { loaded: boolean; busyFor?: number }) {
    jest.resetModules();
    installNativeBoundary({ fs: true });
    let busyLeft = opts.busyFor ?? 0;
    jest.doMock('../../src/services/engines', () => ({ getActiveEngineService: () => ({ isCurrentlyGenerating: () => busyLeft-- > 0 }) }));
    const load = jest.fn(async () => undefined);
    jest.doMock('../../src/services/activeModelService', () => ({ activeModelService: { getLoadedModelIds: () => ({ textModelId: opts.loaded ? 'm1' : null }), loadTextModel: load } }));
    const { useAppStore } = require('../../src/stores/appStore');
    useAppStore.setState({ downloadedModels: [{ id: 'm1', name: 'Qwen 3B' }] });
    return { ...require('../../src/screens/HomeScreen/callLaunch'), load };
  }
  const seen = (useCallLaunch: any) => { const lines: string[] = []; const off = useCallLaunch.subscribe((s: any) => { if (s.status) lines.push(s.status); }); return { lines, off }; };

  it('says it is loading the model by name when it is not loaded yet, then that the call is starting, then clears', async () => {
    const { prepareCallModel, useCallLaunch, clearCallLaunch, load } = setup({ loaded: false });
    const { lines, off } = seen(useCallLaunch);
    await prepareCallModel('m1', 'w1');
    expect(lines).toEqual(['Loading Qwen 3B... (this can take up to a minute)', 'Starting the call...']);
    expect(useCallLaunch.getState().widgetId).toBe('w1');
    expect(load).toHaveBeenCalledWith('m1');
    clearCallLaunch(); off();
    expect(useCallLaunch.getState().status).toBeNull();
  });

  it('goes straight to starting the call when the model is already loaded', async () => {
    const { prepareCallModel, useCallLaunch } = setup({ loaded: true });
    const { lines, off } = seen(useCallLaunch);
    await prepareCallModel('m1');
    expect(lines).toEqual(['Starting the call...', 'Starting the call...']);
    off();
  });

  it('says the model is busy writing an answer and waits for it to finish before loading', async () => {
    const { prepareCallModel, useCallLaunch, load } = setup({ loaded: true, busyFor: 2 });
    const { lines, off } = seen(useCallLaunch);
    await prepareCallModel('m1');
    expect(lines[0]).toBe('Qwen 3B is busy writing an answer. Waiting for it to finish...');
    expect(load).toHaveBeenCalledTimes(1);
    off();
  });

  it('clears the status and passes the error on when the model cannot be loaded', async () => {
    const { prepareCallModel, useCallLaunch, load } = setup({ loaded: false });
    load.mockRejectedValueOnce(new Error('not enough memory'));
    await expect(prepareCallModel('m1')).rejects.toThrow('not enough memory');
    expect(useCallLaunch.getState().status).toBeNull();
  });
});
