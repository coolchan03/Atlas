/** Picking a model file from the phone: which files are accepted and where each kind goes. */
type Picked = { uri: string; name?: string | null };

function load(opts: { picked?: Picked[] | 'cancel' | 'throw'; os?: string; kind?: string; textAdds?: boolean } = {}) {
  jest.resetModules();
  const rn = require('react-native');
  rn.Platform.OS = opts.os ?? 'android';
  jest.doMock('@react-native-documents/picker', () => ({
    pick: jest.fn(async () => {
      if (opts.picked === 'cancel') throw Object.assign(new Error('closed'), { code: 'OPERATION_CANCELED' });
      if (opts.picked === 'throw') throw new Error('picker broke');
      return opts.picked ?? [{ uri: 'file:///a.gguf', name: 'a.gguf' }];
    }),
    types: { allFiles: '*/*' }, errorCodes: { OPERATION_CANCELED: 'OPERATION_CANCELED' }, isErrorWithCode: (e: any) => !!e?.code,
  }));
  const importNative = jest.fn(async () => true);
  jest.doMock('../../../src/screens/ModelsScreen/nativeImageImport', () => ({ inspectNativeImageFile: jest.fn(async () => ({ kind: opts.kind ?? 'unknown', family: 'sdxl' })), importNativeImageFile: importNative }));
  const importGguf = jest.fn(async (_files: unknown, deps: { addDownloadedModel: (m: unknown) => void }) => { if (opts.textAdds) deps.addDownloadedModel({ id: 'm1', name: 'M', filePath: '/m', fileName: 'm.gguf', fileSize: 1 }); });
  jest.doMock('../../../src/screens/ModelsScreen/importHelpers', () => ({ importGgufFiles: importGguf, getErrorMessage: (e: any) => `err:${e?.message}` }));
  const { quickImportModel } = require('../../../src/screens/ModelsScreen/quickImport');
  const { useAppStore } = require('../../../src/stores');
  useAppStore.setState({ downloadedModels: [] });
  const deps = { setAlertState: jest.fn(), setImportProgress: jest.fn() };
  return { quickImportModel, deps, importNative, importGguf, useAppStore };
}
const alertText = (d: { setAlertState: jest.Mock }) => JSON.stringify(d.setAlertState.mock.calls.at(-1)?.[0]);

describe('quick import', () => {
  it('does nothing when the picker returns nothing or is closed', async () => {
    const empty = load({ picked: [] });
    expect(await empty.quickImportModel(empty.deps)).toBe(false);
    const closed = load({ picked: 'cancel' });
    expect(await closed.quickImportModel(closed.deps)).toBe(false);
    expect(closed.deps.setAlertState).not.toHaveBeenCalled();
    expect(closed.deps.setImportProgress).toHaveBeenCalledWith(null);
  });

  it('reports a picker failure', async () => {
    const t = load({ picked: 'throw' });
    expect(await t.quickImportModel(t.deps)).toBe(false);
    expect(alertText(t.deps)).toContain('err:picker broke');
  });

  it.each([
    ['three files', [1, 2, 3].map((n) => ({ uri: `u${n}`, name: `m${n}.gguf` }))],
    ['a text file', [{ uri: 'u', name: 'notes.txt' }]],
    ['a .gguf with a non-model', [{ uri: 'u1', name: 'a.gguf' }, { uri: 'u2', name: 'b.zip' }]],
  ])('asks for a model file when given %s', async (_n, picked) => {
    const t = load({ picked });
    expect(await t.quickImportModel(t.deps)).toBe(false);
    expect(alertText(t.deps)).toContain('Pick a model file');
  });

  it('sends a .safetensors file to the image importer', async () => {
    const t = load({ picked: [{ uri: 'u', name: 'm.safetensors' }] });
    expect(await t.quickImportModel(t.deps)).toBe(true);
    expect(t.importNative).toHaveBeenCalled();
  });

  it.each(['image', 'lora', 'unsupported'])('sends a single .gguf the engine says is %s to the image importer', async (kind) => {
    const t = load({ picked: [{ uri: 'u', name: 'm.gguf' }], kind });
    expect(await t.quickImportModel(t.deps)).toBe(true);
    expect(t.importNative).toHaveBeenCalled();
  });

  it('imports a language model GGUF, or a model and its vision file, and says whether one was added', async () => {
    const one = load({ picked: [{ uri: 'u', name: 'm.gguf' }], textAdds: true });
    expect(await one.quickImportModel(one.deps)).toBe(true);
    expect(one.importGguf).toHaveBeenCalled();
    const two = load({ picked: [{ uri: 'u1', name: 'm.gguf' }, { uri: 'u2', name: 'mmproj.gguf' }], textAdds: false });
    expect(await two.quickImportModel(two.deps)).toBe(false);
    const ios = load({ picked: [{ uri: 'u', name: 'm.gguf' }], os: 'ios', textAdds: true });
    expect(await ios.quickImportModel(ios.deps)).toBe(true);
    expect(ios.importNative).not.toHaveBeenCalled();
    const lite = load({ picked: [{ uri: 'u', name: 'gemma.litertlm' }], textAdds: true });
    expect(await lite.quickImportModel(lite.deps)).toBe(true);
  });

  it('works out a file name from the address when the picker gives none', async () => {
    const t = load({ picked: [{ uri: 'content://docs/My%20Model.gguf', name: null }], textAdds: true });
    expect(await t.quickImportModel(t.deps)).toBe(true);
    expect(t.importGguf.mock.calls[0][0]).toEqual([expect.objectContaining({ name: 'My Model.gguf' })]);
  });
});

export {};
