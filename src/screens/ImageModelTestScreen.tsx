import React, { useEffect, useRef, useState } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import RNFS from 'react-native-fs';
import { useAppStore } from '../stores';
import { activeModelService } from '../services/activeModelService';
import { imageGenerationService } from '../services/imageGenerationService';
import { localDreamGeneratorService, type NativeImageRuntimeStatus, type NativeImageResult } from '../services/localDreamGenerator';
import { hardwareService } from '../services/hardware';
import { selectImageAccelerator, imageComputeMode, type ImageComputeDecision } from '../services/imageAcceleratorSelection';
import type { GeneratedImage, ONNXImageModel } from '../types';
import { imageTestPreset, type ImageTestMode } from '../utils/nativeImageTuning';
import { isOverridableMemoryError } from '../utils/modelLoadErrors';
import { getMissingImageSupportGuides, isRunnableNativeModel, imageFamilyDisplay } from '../utils/nativeImageCompatibility';

import {
  ImageModelTestScreenView, formatTestElapsed as fmt,
  type ImageTestStatus as Status, type ImageTestItem as TestItem, type ImageGpuDiagnostic,
} from './ImageModelTestScreenView';
const TITLES = [
  ['files', 'Model and supporting files'],
  ['ram', 'Available memory'],
  ['engine', 'Image engine loaded'],
  ['diffusion', 'Diffusion / generation progress'],
  ['output', 'Rendered image and prompt accuracy'],
] as const;
const emptyItems = (): TestItem[] => TITLES.map(([key, title]) => ({ key, title, status: 'wait', detail: '' }));
const SMILE = 'A single simple flat yellow smiley face icon: one bright yellow round circle with two small black dot eyes and one curved black smiling mouth, centered on a plain white background, clean vector art, no text.';
function settingsFor(model: ONNXImageModel, mode: ImageTestMode) {
  return imageTestPreset(model, mode, useAppStore.getState().settings);
}

export const ImageModelTestScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const id: string | undefined = route.params?.modelId;
  const model = useAppStore(s => s.downloadedImageModels.find(m => m.id === id));
  const [testMode, setTestMode] = useState<ImageTestMode>('smoke');
  const [includeLoRA, setIncludeLoRA] = useState(false);
  const [includeUpscaler, setIncludeUpscaler] = useState(false);
  const [items, setItems] = useState<TestItem[]>(emptyItems);
  const [running, setRunning] = useState(false);
  // Memory refusal can be overridden, the same "Load Anyway" the chat offers.
  const [canForce, setCanForce] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [diffusionStep, setDiffusionStep] = useState(0);
  const [runtime, setRuntime] = useState<NativeImageRuntimeStatus | null>(null);
  const [probingGpu, setProbingGpu] = useState(false);
  const [gpuDiagnostic, setGpuDiagnostic] = useState<ImageGpuDiagnostic | null>(null);
  const [gpuProbeError, setGpuProbeError] = useState<string | null>(null);
  const [cpuState, setCpuState] = useState<'active' | 'idle' | 'unknown'>('unknown');
  const previousTicks = useRef<number | null>(null);
  const [result, setResult] = useState<GeneratedImage | null>(null);
  const [decision, setDecision] = useState<'engine' | 'review' | 'pass' | 'wrong' | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const started = useRef(0);
  const inProgress = useRef(false);
  const generating = useRef(false);
  const cancelRequested = useRef(false);
  const gone = useRef(false);

  useEffect(() => () => {
    gone.current = true;
    cancelRequested.current = true;
    if (generating.current) void localDreamGeneratorService.cancelGeneration().catch(() => {});
  }, []);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started.current) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [running]);

  useEffect(() => {
    if (!running || model?.backend !== 'sdcpp') return;
    let disposed = false;
    let polling = false;
    const poll = async () => {
      if (polling || !generating.current || cancelRequested.current) return;
      polling = true;
      try {
        const status = await localDreamGeneratorService.getNativeImageRuntimeStatus();
        if (disposed || gone.current || !generating.current || !status) return;
        setRuntime(status);
        if (status.step > 0) setDiffusionStep(prev => Math.max(prev, status.step));
        if (status.cpuTicks >= 0) {
          const previous = previousTicks.current;
          if (previous !== null) setCpuState(status.cpuTicks > previous ? 'active' : 'idle');
          previousTicks.current = status.cpuTicks;
        } else {
          setCpuState('unknown');
        }
      } finally { polling = false; }
    };
    void poll();
    const timer = setInterval(() => { void poll(); }, 12000);
    return () => { disposed = true; clearInterval(timer); };
  }, [running, model?.backend]);

  const checkGpu = async () => {
    if (running || probingGpu || gone.current) return;
    setProbingGpu(true);
    setGpuDiagnostic(null);
    setGpuProbeError(null);
    try {
      const diagnostic = await localDreamGeneratorService.getNativeImageGpuDiagnostics();
      if (!gone.current) setGpuDiagnostic(diagnostic);
    } catch (error: any) {
      if (!gone.current) setGpuProbeError(error?.message || String(error));
    } finally {
      if (!gone.current) setProbingGpu(false);
    }
  };

  const update = (key: string, status: Status, detail: string) => {
    if (!gone.current) setItems(prev => prev.map(item => item.key === key ? { ...item, status, detail } : item));
  };
  const checkModelFiles = (currentModel: ONNXImageModel) => {
    update('files', 'run', 'Checking model family and attached components...');
    if (!isRunnableNativeModel(currentModel)) {
      throw new Error(`Unsupported architecture: ${imageFamilyDisplay(currentModel.nativeImageFamily)}`);
    }
    const missing = getMissingImageSupportGuides(currentModel);
    if (missing.length) {
      throw new Error(`${imageFamilyDisplay(currentModel.nativeImageFamily)} needs: ${missing.map(item => item.label).join(', ')}. Open My models for direct links and attachment controls.`);
    }
    const family = (currentModel.nativeImageFamily || currentModel.backend || 'image').toUpperCase();
    update('files', currentModel.nativeImageFamily === 'unknown' ? 'warn' : 'ok',
      `${family} family. LoRAs ${includeLoRA ? 'on' : 'off'}; upscaler ${includeUpscaler ? 'on' : 'off'}.`);
  };

  const checkMemory = async (modelId: string, force: boolean) => {
    update('ram', 'run', 'Checking available RAM...');
    const mem = await activeModelService.checkMemoryForModel(modelId, 'image');
    if (!mem.canLoad && !force) {
      setCanForce(true);
      throw new Error('The model exceeds the safe memory budget. Free RAM, choose a smaller model, or tap Load anyway.');
    }
    update('ram', !mem.canLoad || mem.severity === 'warning' ? 'warn' : 'ok',
      `${!mem.canLoad ? 'Forced. ' : ''}Estimated ${mem.requiredMemoryGB.toFixed(1)} GB required, ${mem.availableMemoryGB.toFixed(1)} GB usable.`);
  };

  const prepareEngine = async (currentModel: ONNXImageModel, force: boolean) => {
    update('engine', 'run', 'Selecting and checking image accelerator...');
    const settings = useAppStore.getState().settings;
    const imageDecision = await selectImageAccelerator(currentModel.backend || 'mnn',
      { mode: imageComputeMode(settings), allowCpuFallback: settings.imageAllowCpuFallback === true }, {
        vulkan: () => localDreamGeneratorService.getNativeImageGpuDiagnostics(),
        sdOpencl: () => localDreamGeneratorService.getNativeImageGpuDiagnostics('opencl'),
        opencl: () => hardwareService.getOpenCLCapability(),
        npu: async () => (await hardwareService.getSoCInfo()).hasNPU,
      });
    if (cancelRequested.current) return null;
    update('engine', 'run', `${imageDecision.note}. Loading model...`);
    const t0 = Date.now();
    await activeModelService.loadImageModel(currentModel.id, undefined, force ? { override: true } : undefined);
    if (cancelRequested.current) return null;
    if (!await localDreamGeneratorService.isModelLoaded()) throw new Error('The image engine did not report a loaded model.');
    const backend = await localDreamGeneratorService.getLoadedBackend();
    const label = (backend || currentModel.backend || 'unknown').toUpperCase();
    update('engine', 'ok', `${label} / ${imageDecision.selected.toUpperCase()} selected in ${((Date.now() - t0) / 1000).toFixed(1)}s. Loading alone does not prove that the checkpoint will render.`);
    return { backend, imageDecision };
  };

  const makeTestImage = (currentModel: ONNXImageModel, config: {
    cfg: ReturnType<typeof settingsFor>; imageDecision: ImageComputeDecision;
  }) => {
    const { cfg, imageDecision } = config;
    update('diffusion', 'run', 'Initializing diffusion. The first step may take several minutes...');
    generating.current = true;
    return localDreamGeneratorService.generateImage({
      ...cfg, prompt: SMILE, seed: 42,
      negativePrompt: currentModel.nativeImageFamily === 'flux' ? '' : 'blurry, distorted, watermark, text',
      useOpenCL: imageDecision.useOpenCL,
      ...(imageDecision.computeBackend ? { computeBackend: imageDecision.computeBackend } : {}),
      fallbacks: imageDecision.fallbacks,
      onFallback: status => {
        if (cancelRequested.current || gone.current) return;
        setDiffusionStep(0);
        update('diffusion', 'run', status);
      },
      previewInterval: 0, skipLoRA: !includeLoRA, skipUpscaler: !includeUpscaler,
      threads: useAppStore.getState().settings.imageThreads ?? 4,
    }, progress => {
      if (cancelRequested.current || gone.current) return;
      setDiffusionStep(progress.step);
      update('diffusion', 'run', `Step ${progress.step}/${progress.totalSteps || cfg.steps}; ${fmt(Math.floor((Date.now() - started.current) / 1000))}`);
    });
  };

  const finishTest = async (image: NativeImageResult, currentModel: ONNXImageModel, engine: {
    backend: string | null; imageDecision: ImageComputeDecision; cfg: ReturnType<typeof settingsFor>;
  }) => {
    if (!image?.imagePath) throw new Error('Diffusion finished without creating an image.');
    update('diffusion', 'ok', `${engine.cfg.steps} diffusion steps requested and PNG output returned.`);
    update('output', 'run', 'Checking the generated image...');
    const filePath = image.imagePath.replace(/^file:\/\//, '');
    if (!await RNFS.exists(filePath)) throw new Error('The engine reported success, but the image file is missing.');
    const info = await RNFS.stat(filePath);
    const pngHeader = await RNFS.read(filePath, 8, 0, 'base64');
    if (cancelRequested.current || gone.current) return;
    if (Number(info.size) < 64 || pngHeader !== 'iVBORw0KGgo=') {
      throw new Error('The output is too small or does not contain a valid PNG header.');
    }
    const { execution, ...renderedImage } = image;
    const engineLabel = (engine.backend || currentModel.backend || 'unknown').toUpperCase();
    const computeLabel = (execution?.computeBackend ?? engine.imageDecision.selected).toUpperCase();
    const recoveryNote = execution?.fallbackNotes.length ? ` ${execution.fallbackNotes.join('. ')}.` : '';
    update('engine', 'ok', `${engineLabel} / ${computeLabel} selected for the completed render.${recoveryNote}`);
    setResult(renderedImage);
    setDecision(testMode === 'smoke' ? 'engine' : 'review');
    const outputNote = testMode === 'smoke'
      ? 'Native 1-step engine test passed; artistic quality was not tested.'
      : 'Confirm the subject visually before marking success.';
    update('output', testMode === 'smoke' ? 'ok' : 'warn',
      `${image.width}x${image.height} PNG (${Math.round(Number(info.size) / 1024)} KB). ${outputNote}`);
  };

  const reportTestFailure = (err: any, force: boolean) => {
    if (cancelRequested.current || gone.current) return;
    const message = err?.message || String(err || 'Image generation failed');
    if (!force && isOverridableMemoryError(err)) setCanForce(true);
    setFailure(message);
    setItems(prev => {
      const current = prev.find(step => step.status === 'run');
      return current ? prev.map(step => step.key === current.key ?
        { ...step, status: 'fail', detail: message } : step) : prev;
    });
  };

  const doTest = async (force = false) => {
    if (!model || inProgress.current) return;
    inProgress.current = true;
    setCanForce(false);
    cancelRequested.current = false;
    started.current = Date.now();
    setItems(emptyItems());
    setFailure(null);
    setDecision(null);
    setResult(null);
    setElapsed(0);
    setDiffusionStep(0);
    setRuntime(null);
    setCpuState('unknown');
    previousTicks.current = null;
    setRunning(true);
    const cfg = settingsFor(model, testMode);
    try {
      if (imageGenerationService.getState().isGenerating || await localDreamGeneratorService.isGenerating()) {
        throw new Error('An image is already being generated. Finish or cancel it first.');
      }
      checkModelFiles(model);
      if (cancelRequested.current) return;
      await checkMemory(model.id, force);
      if (cancelRequested.current) return;
      const engine = await prepareEngine(model, force);
      if (!engine) return;
      const image = await makeTestImage(model, { cfg, imageDecision: engine.imageDecision });
      generating.current = false;
      if (cancelRequested.current) return;
      await finishTest(image, model, { ...engine, cfg });
    } catch (err: any) {
      reportTestFailure(err, force);
    } finally {
      generating.current = false;
      inProgress.current = false;
      if (!gone.current) {
        setElapsed(Math.floor((Date.now() - started.current) / 1000));
        setRunning(false);
      }
    }
  };
  const stop = async () => {
    cancelRequested.current = true;
    update('diffusion', 'warn', 'Cancellation requested...');
    if (generating.current) await localDreamGeneratorService.cancelGeneration().catch(() => {});
  };

  const cfg = model ? settingsFor(model, testMode) : null;
  return <ImageModelTestScreenView
    model={model} testMode={testMode} cfg={cfg} includeLoRA={includeLoRA} includeUpscaler={includeUpscaler}
    running={running} elapsed={elapsed} canForce={canForce} probingGpu={probingGpu}
    gpuDiagnostic={gpuDiagnostic} gpuProbeError={gpuProbeError} runtime={runtime}
    diffusionStep={diffusionStep} cpuState={cpuState} items={items} result={result}
    decision={decision} failure={failure} prompt={SMILE} onBack={() => navigation.goBack()}
    onMode={setTestMode} onLoRA={setIncludeLoRA} onUpscaler={setIncludeUpscaler}
    onCheckGpu={checkGpu} onStart={doTest} onCancel={stop}
    onDecision={value => {
      setDecision(value);
      update('output', value === 'pass' ? 'ok' : 'fail', value === 'pass'
        ? 'PNG valid; user confirmed the subject.' : 'PNG valid but prompt not followed.');
    }}
  />;
};
