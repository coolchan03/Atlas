const mockPick = jest.fn();
const mockAttach = jest.fn();
const mockModify = jest.fn();
const mockUnload = jest.fn(async (..._a: unknown[]) => undefined);
const mockAddModel = jest.fn(async (..._a: unknown[]) => undefined);
const listeners: Record<string, (e: unknown) => void> = {};

jest.mock('@react-native-documents/picker', () => ({ pick: (...a: unknown[]) => mockPick(...a), types: { allFiles: '*/*' }, isErrorWithCode: (e: any) => !!e?.code, errorCodes: { OPERATION_CANCELED: 'CANCELED' } }));
jest.mock('../../src/services', () => ({ modelManager: { addDownloadedImageModel: (...a: unknown[]) => mockAddModel(...a) } }));
jest.mock('../../src/services/activeModelService', () => ({ activeModelService: { unloadImageModel: (...a: unknown[]) => mockUnload(...a) } }));

import { Alert, NativeModules, Platform } from 'react-native';
import { isPickerCancel, modifyImageSupport, pickAndAttachImageSupport } from '../../src/screens/ModelsScreen/imageSupportActions';
import { useAppStore } from '../../src/stores';

const model = (over: Record<string, unknown> = {}): any => ({ id: 'img1', name: 'Image', backend: 'sdcpp', modelPath: '/models/img1', size: 1, supportFiles: [], ...over });
const answerWith = (label: string | null) => jest.spyOn(Alert, 'alert').mockImplementation(((_t: string, _m: string, buttons: any[], opts: any) => { const b = buttons?.find((x) => x.text === label); if (b) b.onPress?.(); else opts?.onDismiss?.(); }) as never);
const pickFile = (name: string) => mockPick.mockResolvedValue([{ name, uri: `content://${name}` }]);

beforeEach(() => {
  jest.restoreAllMocks(); [mockPick, mockAttach, mockModify, mockUnload, mockAddModel].forEach((m) => m.mockClear());
  Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
  (NativeModules as any).LocalDreamModule = { attachAtlasImageSupport: mockAttach, modifyAtlasImageSupport: mockModify, addListener: jest.fn(), removeListeners: jest.fn() };
  mockAttach.mockImplementation(async ({ fileName, kind, strength }: any) => ({ name: fileName, kind, strength, enabled: true }));
  useAppStore.setState({ activeImageModelId: null } as never);
  const RN = require('react-native');
  Object.defineProperty(RN, 'NativeEventEmitter', { configurable: true, value: function Emitter() { return { addListener: (n: string, cb: (e: unknown) => void) => { listeners[n] = cb; return { remove: jest.fn() }; } }; } });
});

describe('attaching image support files', () => {
  it('only works for directly imported sdcpp models on Android', async () => {
    await expect(pickAndAttachImageSupport(model({ backend: 'mnn' }), jest.fn())).rejects.toThrow(/directly imported/);
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
    await expect(pickAndAttachImageSupport(model(), jest.fn())).rejects.toThrow(/directly imported/);
  });
  it('returns null when nothing is chosen and rejects unsupported file types', async () => {
    mockPick.mockResolvedValue([]); expect(await pickAndAttachImageSupport(model(), jest.fn())).toBeNull();
    pickFile('notes.txt'); await expect(pickAndAttachImageSupport(model(), jest.fn())).rejects.toThrow(/Supported add-on formats/);
  });
  it.each([
    ['config.json', 'config'], ['ae-vae.safetensors', 'vae'], ['t5xxl_fp16.safetensors', 't5xxl'], ['clip_l.safetensors', 'clip_l'],
    ['qwen3-4b.gguf', 'llm'], ['style-lora.safetensors', 'lora'],
  ])('works out what %s is without asking', async (name, kind) => {
    pickFile(name);
    const file = await pickAndAttachImageSupport(model(), jest.fn());
    expect(file?.kind).toBe(kind); expect(mockAddModel).toHaveBeenCalled();
  });
  it('asks what an unclear file is, and stops when the person backs out', async () => {
    pickFile('mystery.gguf'); answerWith('T5XXL');
    expect((await pickAndAttachImageSupport(model(), jest.fn()))?.kind).toBe('t5xxl');
    answerWith('Qwen3 / LLM'); expect((await pickAndAttachImageSupport(model(), jest.fn()))?.kind).toBe('llm');
    answerWith('CLIP-L'); expect((await pickAndAttachImageSupport(model(), jest.fn()))?.kind).toBe('clip_l');
    answerWith(null); expect(await pickAndAttachImageSupport(model(), jest.fn())).toBeNull();
    pickFile('mystery.safetensors'); answerWith('Style LoRA'); expect((await pickAndAttachImageSupport(model(), jest.fn()))?.kind).toBe('lora');
    answerWith('VAE'); expect((await pickAndAttachImageSupport(model(), jest.fn()))?.kind).toBe('vae');
    answerWith('Text encoder'); expect(await pickAndAttachImageSupport(model(), jest.fn())).toBeNull(); // backed out of the second question
    answerWith(null); expect(await pickAndAttachImageSupport(model(), jest.fn())).toBeNull();
    pickFile('model.pth'); answerWith('Attach upscaler'); await expect(pickAndAttachImageSupport(model(), jest.fn())).rejects.toThrow(/Unknown PyTorch upscaler/);
    pickFile('4x-esrgan.pth'); answerWith('Attach upscaler'); expect((await pickAndAttachImageSupport(model(), jest.fn()))?.kind).toBe('upscaler');
    pickFile('model.pth');
    answerWith(null); expect(await pickAndAttachImageSupport(model(), jest.fn())).toBeNull();
  });
  it('rejects a combination the runtime cannot load', async () => {
    pickFile('lora.gguf'); await expect(pickAndAttachImageSupport(model(), jest.fn())).rejects.toThrow(/GGUF style LoRAs are not supported/);
  });
  it('checks the format, unloads the model if it is in use, reports progress and replaces the same kind', async () => {
    pickFile('vae.safetensors');
    const busy = jest.fn();
    useAppStore.setState({ activeImageModelId: 'img1' } as never);
    mockAttach.mockImplementationOnce(async ({ fileName, kind }: any) => { listeners.LocalDreamConvert({ stage: 'copy', fraction: 5 }); listeners.LocalDreamConvert({ stage: 'other' }); return { name: fileName, kind, strength: 0.75, enabled: true }; });
    const old = { kind: 'vae', name: 'old-vae.safetensors', strength: 1, enabled: true };
    const lora = { kind: 'lora', name: 'a.safetensors', strength: 0.5, enabled: true };
    await pickAndAttachImageSupport(model({ supportFiles: [old, lora] }), busy);
    expect(mockUnload).toHaveBeenCalledWith(true);
    expect(busy).toHaveBeenCalledWith('Attaching vae.safetensors', 0); expect(busy).toHaveBeenCalledWith('Attaching vae.safetensors', 0.99);
    const saved = (mockAddModel.mock.calls[0] as any[])[0];
    expect(saved.supportFiles.map((f: any) => f.name)).toEqual(['a.safetensors', 'vae.safetensors']);
  });
});

describe('changing or removing an attached file', () => {
  const lora = { kind: 'lora', name: 'a.safetensors', strength: 0.5, enabled: true };
  it('changes strength within limits, switches on and off, and deletes', async () => {
    await modifyImageSupport(model({ supportFiles: [lora] }), lora as any, { strength: 9 });
    expect(mockModify).toHaveBeenLastCalledWith(expect.objectContaining({ strength: 2, enabled: true, delete: false }));
    await modifyImageSupport(model({ supportFiles: [lora] }), lora as any, { strength: -9, enabled: false });
    expect(mockModify).toHaveBeenLastCalledWith(expect.objectContaining({ strength: -2, enabled: false }));
    expect((mockAddModel.mock.calls.at(-1) as any[])[0].supportFiles[0]).toMatchObject({ enabled: false, strength: -2 });
    await modifyImageSupport(model({ supportFiles: [lora, { ...lora, name: 'b.safetensors' }] }), lora as any, { delete: true });
    expect((mockAddModel.mock.calls.at(-1) as any[])[0].supportFiles.map((f: any) => f.name)).toEqual(['b.safetensors']);
  });
  it('refuses other image backends and unloads a model in use first', async () => {
    await expect(modifyImageSupport(model({ backend: 'mnn' }), lora as any, {})).rejects.toThrow(/cannot modify/);
    useAppStore.setState({ activeImageModelId: 'img1' } as never);
    await modifyImageSupport(model({ supportFiles: [lora] }), lora as any, {});
    expect(mockUnload).toHaveBeenCalledWith(true);
  });
  it('tells a cancelled picker from a real error', () => {
    expect(isPickerCancel({ code: 'CANCELED' })).toBe(true); expect(isPickerCancel({ code: 'OTHER' })).toBe(false); expect(isPickerCancel(new Error('x'))).toBe(false);
  });
});
