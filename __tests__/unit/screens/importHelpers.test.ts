/** Importing model files: what each file name means, the questions asked, and what is registered. */
type Answer = Record<string, string>; // dialog title -> button text to press

function load(o: { answers?: Answer; picked?: unknown; pickThrows?: boolean; importThrows?: boolean; attachThrows?: boolean } = {}) {
  jest.resetModules();
  const rn = require('react-native');
  jest.spyOn(rn.Alert, 'alert').mockImplementation(((title: string, _m: string, buttons?: Array<{ text: string; onPress?: () => void }>) => {
    const want = o.answers?.[title];
    (buttons ?? []).find((b) => b.text === want)?.onPress?.();
  }) as never);
  const manager = {
    importLocalModel: jest.fn(async (a: { fileName: string }) => { if (o.importThrows) throw new Error('copy failed'); return { id: `id-${a.fileName}`, name: a.fileName.replace(/\.\w+$/, ''), fileName: a.fileName }; }),
    setEmbeddedMtp: jest.fn(async () => undefined),
    attachDraft: jest.fn(async (_id: string, _f: unknown, cb: (f: number) => void) => { cb(0.5); if (o.attachThrows) throw new Error('draft failed'); }),
    attachMmProj: jest.fn(async (_id: string, _f: unknown, cb: (f: number) => void) => { cb(0.5); if (o.attachThrows) throw new Error('vision failed'); }),
  };
  jest.doMock('../../../src/services', () => ({ modelManager: manager }));
  jest.doMock('@react-native-documents/picker', () => ({
    pick: jest.fn(async () => { if (o.pickThrows) throw new Error('closed'); return o.picked; }), types: { allFiles: '*/*' },
  }));
  const mod = require('../../../src/screens/ModelsScreen/importHelpers');
  const deps = { setAlertState: jest.fn(), setImportProgress: jest.fn(), addDownloadedModel: jest.fn() };
  return { mod, manager, deps };
}
const lastAlert = (d: { setAlertState: jest.Mock }) => JSON.stringify(d.setAlertState.mock.calls.at(-1)?.[0]);
const file = (name: string | null, size: number | null = 1000, uri = `file:///${name}`) => ({ uri, name, size });

describe('reading file names', () => {
  it('recognises vision files, MTP files and vision-capable model names', () => {
    const { mod } = load();
    expect(mod.isMmProj('mmproj-model.gguf')).toBe(true);
    expect(mod.isMmProj('Projector.gguf')).toBe(true);
    expect(mod.isMmProj('clip-vit.gguf')).toBe(true);
    expect(mod.isMmProj('clip.bin')).toBe(false);
    expect(mod.isMmProj('model.gguf')).toBe(false);
    expect(mod.isDraftFile('model-mtp.gguf')).toBe(true);
    expect(mod.isDraftFile('nextn.gguf')).toBe(true);
    expect(mod.isDraftFile('mtpx.gguf')).toBe(false);
    expect(mod.looksLikeVisionModel('Qwen2-VL-7B.gguf')).toBe(true);
    expect(mod.looksLikeVisionModel('llama-3-8b.gguf')).toBe(false);
    expect(mod.getErrorMessage(new Error('boom'))).toBe('boom');
    expect(mod.getErrorMessage('x')).toBe('Unknown error');
  });

  it('pairs a model with its vision file by name, then by size, then as given', () => {
    const { mod } = load();
    const a = { uri: 'a', name: 'big.gguf', size: 5000 };
    const b = { uri: 'b', name: 'small.gguf', size: 100 };
    expect(mod.classifyGgufPair(a, { uri: 'p', name: 'mmproj.gguf', size: 9999 })).toEqual({ mainFile: a, mmProjFile: expect.objectContaining({ uri: 'p' }) });
    expect(mod.classifyGgufPair({ uri: 'p', name: 'mmproj.gguf', size: 1 }, a).mainFile).toBe(a);
    expect(mod.classifyGgufPair(a, b)).toEqual({ mainFile: a, mmProjFile: b });
    expect(mod.classifyGgufPair(b, a)).toEqual({ mainFile: a, mmProjFile: b });
    expect(mod.classifyGgufPair({ ...a, size: 0 }, b).mainFile.uri).toBe('a');
  });
});

describe('importing one file', () => {
  it('imports a plain model and says so', async () => {
    const { mod, manager, deps } = load();
    await mod.importGgufFiles([file('llama.gguf')], deps);
    expect(manager.importLocalModel).toHaveBeenCalledWith(expect.objectContaining({ fileName: 'llama.gguf', engine: undefined }));
    expect(deps.addDownloadedModel).toHaveBeenCalled();
    expect(lastAlert(deps)).toContain('imported successfully');
  });

  it('uses "unknown" for a file with no name, and refuses a vision file on its own', async () => {
    const { mod, manager, deps } = load();
    await mod.importGgufFiles([file(null)], deps);
    expect(manager.importLocalModel).toHaveBeenCalledWith(expect.objectContaining({ fileName: 'unknown' }));
    const t = load();
    await t.mod.importGgufFiles([file('mmproj-x.gguf')], t.deps);
    expect(lastAlert(t.deps)).toContain('vision file');
    expect(t.manager.importLocalModel).not.toHaveBeenCalled();
  });

  it('asks about LiteRT vision, and passes the answer on', async () => {
    const yes = load({ answers: { 'Vision Support': 'Vision' } });
    await yes.mod.importGgufFiles([file('gemma.litertlm')], yes.deps);
    expect(yes.manager.importLocalModel).toHaveBeenCalledWith(expect.objectContaining({ engine: 'litert', liteRTVision: true }));
    const no = load({ answers: { 'Vision Support': 'Text Only' } });
    await no.mod.importGgufFiles([file('gemma.litertlm')], no.deps);
    expect(no.manager.importLocalModel).toHaveBeenCalledWith(expect.objectContaining({ liteRTVision: false }));
  });

  it('asks what a file with MTP in its name is: cancel, only the MTP file, or a complete model', async () => {
    const cancel = load({ answers: { 'MTP in the file name': 'Cancel' } });
    await cancel.mod.importGgufFiles([file('model-mtp.gguf')], cancel.deps);
    expect(cancel.manager.importLocalModel).not.toHaveBeenCalled();
    const only = load({ answers: { 'MTP in the file name': 'Only the MTP file' } });
    await only.mod.importGgufFiles([file('model-mtp.gguf')], only.deps);
    expect(lastAlert(only.deps)).toContain('Add it to a model');
    const full = load({ answers: { 'MTP in the file name': 'Complete model' } });
    await full.mod.importGgufFiles([file('model-mtp.gguf')], full.deps);
    expect(full.manager.setEmbeddedMtp).toHaveBeenCalledWith('id-model-mtp.gguf', true);
    expect(lastAlert(full.deps)).toContain('MTP built in');
  });

  it('offers to add a vision file to a model that looks like it needs one', async () => {
    const later = load({ answers: { 'Vision model?': 'Later' } });
    await later.mod.importGgufFiles([file('Qwen2-VL-7B.gguf')], later.deps);
    expect(lastAlert(later.deps)).toContain('imported successfully');
    const add = load({ answers: { 'Vision model?': 'Add vision file' }, picked: [{ uri: 'file:///mmproj.gguf', name: 'mmproj.gguf', size: 10 }] });
    await add.mod.importGgufFiles([file('Qwen2-VL-7B.gguf')], add.deps);
    expect(add.manager.attachMmProj).toHaveBeenCalled();
    expect(lastAlert(add.deps)).toContain('Vision added');
  });
});

describe('importing two files', () => {
  it('attaches an MTP file to the model next to it, and reports a failed attach', async () => {
    const ok = load();
    await ok.mod.importGgufFiles([file('model.gguf', 5000), file('model-mtp.gguf', 100)], ok.deps);
    expect(ok.manager.attachDraft).toHaveBeenCalled();
    expect(lastAlert(ok.deps)).toContain('with its MTP file');
    const bad = load({ attachThrows: true });
    await bad.mod.importGgufFiles([file('model-mtp.gguf', 100), file('model.gguf', 5000)], bad.deps);
    expect(lastAlert(bad.deps)).toContain('MTP file not added');
  });

  it('imports a model with its vision projector after confirming, or stops on cancel', async () => {
    const yes = load({ answers: { 'Import Vision Model?': 'Import' } });
    await yes.mod.importGgufFiles([file('model.gguf', 5000), file('mmproj.gguf', 100)], yes.deps);
    expect(yes.manager.importLocalModel).toHaveBeenCalledWith(expect.objectContaining({ fileName: 'model.gguf', mmProjFileName: 'mmproj.gguf' }));
    expect(lastAlert(yes.deps)).toContain('vision projector');
    const no = load({ answers: { 'Import Vision Model?': 'Cancel' } });
    await no.mod.importGgufFiles([file('model.gguf', 5000), file('mmproj.gguf', 100)], no.deps);
    expect(no.manager.importLocalModel).not.toHaveBeenCalled();
    const unnamed = load({ answers: { 'Import Vision Model?': 'Import' } });
    await unnamed.mod.importGgufFiles([file(null, null), file('mmproj.gguf', null)], unnamed.deps);
    expect(unnamed.manager.importLocalModel).toHaveBeenCalled();
  });
});

describe('attaching files to a model already imported', () => {
  it.each([
    ['pickAndAttachMmProj', 'attachMmProj', 'Vision added', 'Not a vision file', 'Could not add the vision file'],
    ['pickAndAttachDraft', 'attachDraft', 'MTP file added', 'Not an MTP file', 'Could not add the MTP file'],
  ])('%s picks a .gguf and attaches it', async (fn, method, okTitle, wrongTitle, failTitle) => {
    const good = load({ picked: [{ uri: 'file:///x.gguf', name: 'x.gguf', size: 5 }] });
    expect(await good.mod[fn]('m1', 'Model', good.deps)).toBe(true);
    expect(good.manager[method as 'attachMmProj']).toHaveBeenCalled();
    expect(lastAlert(good.deps)).toContain(okTitle);
    const unnamed = load({ picked: [{ uri: 'file:///folder/My%20File.gguf', name: null, size: null }] });
    expect(await unnamed.mod[fn]('m1', 'Model', unnamed.deps)).toBe(true);
    const wrong = load({ picked: [{ uri: 'file:///x.txt', name: 'x.txt', size: 5 }] });
    expect(await wrong.mod[fn]('m1', 'Model', wrong.deps)).toBe(false);
    expect(lastAlert(wrong.deps)).toContain(wrongTitle);
    expect(await load({ picked: [] }).mod[fn]('m1', 'Model', load().deps)).toBe(false);
    expect(await load({ pickThrows: true }).mod[fn]('m1', 'Model', load().deps)).toBe(false);
    const fails = load({ picked: [{ uri: 'file:///x.gguf', name: 'x.gguf', size: 5 }], attachThrows: true });
    expect(await fails.mod[fn]('m1', 'Model', fails.deps)).toBe(false);
    expect(lastAlert(fails.deps)).toContain(failTitle);
    expect(fails.deps.setImportProgress).toHaveBeenLastCalledWith(null);
  });
});

export {};
