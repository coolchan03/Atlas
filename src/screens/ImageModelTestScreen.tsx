import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, Switch, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Feather';
import RNFS from 'react-native-fs';
import { useTheme } from '../theme';
import { useAppStore } from '../stores';
import { activeModelService } from '../services/activeModelService';
import { imageGenerationService } from '../services/imageGenerationService';
import { localDreamGeneratorService } from '../services/localDreamGenerator';
import type { GeneratedImage, ONNXImageModel } from '../types';
import { imageTestPreset } from '../utils/nativeImageTuning';
import { getMissingImageSupportGuides, isRunnableNativeModel, imageFamilyDisplay } from '../utils/nativeImageCompatibility';

type Status = 'wait' | 'run' | 'ok' | 'warn' | 'fail';
type TestItem = { key: string; title: string; status: Status; detail: string };
const TITLES = [
  ['files', 'Model and supporting files'],
  ['ram', 'Available memory'],
  ['engine', 'Image engine loaded'],
  ['diffusion', 'Diffusion / generation progress'],
  ['output', 'Rendered image and prompt accuracy'],
] as const;
const emptyItems = (): TestItem[] => TITLES.map(([key, title]) => ({ key, title, status: 'wait', detail: '' }));
const SMILE = 'A single simple flat yellow smiley face icon: one bright yellow round circle with two small black dot eyes and one curved black smiling mouth, centered on a plain white background, clean vector art, no text.';
const fmt = (s: number) => Math.floor(s / 60) + 'm ' + s % 60 + 's';
function settingsFor(model: ONNXImageModel, quality: boolean) {
  return imageTestPreset(model, quality, useAppStore.getState().settings);
}

export const ImageModelTestScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { colors } = useTheme();
  const id: string | undefined = route.params?.modelId;
  const model = useAppStore(s => s.downloadedImageModels.find(m => m.id === id));
  const [quality, setQuality] = useState(true);
  const [includeLoRA, setIncludeLoRA] = useState(false);
  const [includeUpscaler, setIncludeUpscaler] = useState(false);
  const [items, setItems] = useState<TestItem[]>(emptyItems);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [diffusionStep, setDiffusionStep] = useState(0);
  const [result, setResult] = useState<GeneratedImage | null>(null);
  const [decision, setDecision] = useState<'review' | 'pass' | 'wrong' | null>(null);
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

  const update = (key: string, status: Status, detail: string) => {
    if (!gone.current) setItems(prev => prev.map(item => item.key === key ? { ...item, status, detail } : item));
  };
  const doTest = async () => {
    if (!model || inProgress.current) return;
    inProgress.current = true;
    cancelRequested.current = false;
    started.current = Date.now();
    setItems(emptyItems());
    setFailure(null);
    setDecision(null);
    setResult(null);
    setElapsed(0);
    setDiffusionStep(0);
    setRunning(true);
    const cfg = settingsFor(model, quality);
    try {
      if (imageGenerationService.getState().isGenerating || await localDreamGeneratorService.isGenerating()) {
        throw new Error('An image is already being generated. Finish or cancel it first.');
      }
      update('files', 'run', 'Checking model family and attached components...');
      if (!isRunnableNativeModel(model)) {
        throw new Error('Unsupported architecture: ' + imageFamilyDisplay(model.nativeImageFamily));
      }
      const missing = getMissingImageSupportGuides(model);
      if (missing.length) {
        throw new Error(imageFamilyDisplay(model.nativeImageFamily) +
          ' needs: ' + missing.map(item => item.label).join(', ') +
          '. Open My models for direct links and attachment controls.');
      }
      update('files', model.nativeImageFamily === 'unknown' ? 'warn' : 'ok',
        (model.nativeImageFamily || model.backend || 'image').toUpperCase() +
        ' family. LoRAs ' + (includeLoRA ? 'on' : 'off') +
        '; upscaler ' + (includeUpscaler ? 'on' : 'off') + '.');
      if (cancelRequested.current) return;

      update('ram', 'run', 'Checking available RAM...');
      const mem = await activeModelService.checkMemoryForModel(model.id, 'image');
      if (!mem.canLoad) throw new Error('The model exceeds the safe memory budget. Free RAM or choose a smaller model.');
      update('ram', mem.severity === 'warning' ? 'warn' : 'ok',
        'Estimated ' + mem.requiredMemoryGB.toFixed(1) + ' GB required, ' +
        mem.availableMemoryGB.toFixed(1) + ' GB usable.');
      if (cancelRequested.current) return;

      update('engine', 'run', 'Selecting the image model...');
      const t0 = Date.now();
      await activeModelService.loadImageModel(model.id);
      if (cancelRequested.current) return;
      if (!await localDreamGeneratorService.isModelLoaded()) throw new Error('The image engine did not report a loaded model.');
      const backend = await localDreamGeneratorService.getLoadedBackend();
      update('engine', 'ok', (backend || model.backend || 'unknown').toUpperCase() +
        ' selected in ' + ((Date.now() - t0) / 1000).toFixed(1) +
        's. Loading alone does not prove that the checkpoint will render.');

      update('diffusion', 'run', 'Initializing diffusion. The first step may take several minutes...');
      generating.current = true;
      const image = await localDreamGeneratorService.generateImage({
        ...cfg, prompt: SMILE, seed: 42,
        negativePrompt: model.nativeImageFamily === 'flux' ? '' : 'blurry, distorted, watermark, text',
        useOpenCL: model.backend === 'mnn', previewInterval: 0,
        skipLoRA: !includeLoRA, skipUpscaler: !includeUpscaler,
      }, progress => {
        if (cancelRequested.current || gone.current) return;
        setDiffusionStep(progress.step);
        update('diffusion', 'run', 'Step ' + progress.step + '/' +
          (progress.totalSteps || cfg.steps) + '; ' + fmt(Math.floor((Date.now() - started.current) / 1000)));
      });
      generating.current = false;
      if (cancelRequested.current) return;
      if (!image?.imagePath) throw new Error('Diffusion finished without creating an image.');
      update('diffusion', 'ok', cfg.steps + ' diffusion steps requested and PNG output returned.');

      update('output', 'run', 'Checking the generated image...');
      const filePath = image.imagePath.replace(/^file:\/\//, '');
      if (!await RNFS.exists(filePath)) throw new Error('The engine reported success, but the image file is missing.');
      const info = await RNFS.stat(filePath);
      const pngHeader = await RNFS.read(filePath, 8, 0, 'base64');
      if (Number(info.size) < 64 || pngHeader !== 'iVBORw0KGgo=') {
        throw new Error('The output is too small or does not contain a valid PNG header.');
      }
      if (!gone.current) { setResult(image); setDecision('review'); }
      update('output', 'warn', image.width + 'x' + image.height + ' PNG (' +
        Math.round(Number(info.size) / 1024) + ' KB). Confirm the contents visually.');
    } catch (err: any) {
      if (!cancelRequested.current && !gone.current) {
        const message = err?.message || String(err || 'Image generation failed');
        setFailure(message);
        setItems(prev => {
          const current = prev.find(step => step.status === 'run');
          return current ? prev.map(step => step.key === current.key ?
            { ...step, status: 'fail', detail: message } : step) : prev;
        });
      }
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

  const cfg = model ? settingsFor(model, quality) : null;
  const card = { backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginBottom: 10 };
  const bordered = (color: string) => ({
    borderColor: color, borderWidth: 1, borderRadius: 9, padding: 10, marginRight: 8,
  });
  const tone = (status: Status) => status === 'ok' ? (colors.success || '#299662') :
    status === 'fail' ? colors.error : status === 'warn' ? '#b78a26' :
    status === 'run' ? colors.primary : colors.textMuted;
  const imageUri = result?.imagePath ?
    (result.imagePath.startsWith('file://') ? result.imagePath : 'file://' + result.imagePath) : '';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12 }}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 6 }}>
          <Icon name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={{ color: colors.text, fontSize: 21, fontWeight: '700', marginLeft: 8 }}>Test image model</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 56, maxWidth: 850, width: '100%', alignSelf: 'center' }}>
        {!model ? <Text style={{ color: colors.error }}>Image model not found.</Text> : <>
          <View style={card}>
            <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>{model.name}</Text>
            <Text style={{ color: colors.textSecondary, marginTop: 6 }}>Fixed test: yellow smiley face, seed 42, no LLM prompt rewriting.</Text>
            <View style={{ flexDirection: 'row', marginTop: 12 }}>
              {[false, true].map(v => <TouchableOpacity key={String(v)} disabled={running}
                onPress={() => setQuality(v)} style={bordered(quality === v ? colors.primary : colors.border)}>
                <Text style={{ color: quality === v ? colors.primary : colors.textSecondary }}>
                  {v ? 'Quality check' : 'Quick engine check'}
                </Text>
              </TouchableOpacity>)}
            </View>
            <Text style={{ color: colors.textMuted, marginTop: 8 }}>
              {cfg?.width}x{cfg?.height} · {cfg?.steps} steps · CFG {cfg?.guidanceScale}
              {quality ? '. Quality mode may be slow or memory-intensive on a phone.' :
                '. Quick mode checks the engine; SDXL may look poor at this resolution.'}
            </Text>
            {model.backend === 'sdcpp' && <>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                <Text style={{ color: colors.text, flex: 1 }}>Include style LoRAs</Text>
                <Switch disabled={running} value={includeLoRA} onValueChange={setIncludeLoRA} />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ color: colors.text, flex: 1 }}>Include ESRGAN upscaler</Text>
                <Switch disabled={running} value={includeUpscaler} onValueChange={setIncludeUpscaler} />
              </View>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>Both off by default. RealESRGAN_x4plus.pth is a 4x upscaler, not a style LoRA.</Text>
            </>}
            <TouchableOpacity onPress={running ? stop : doTest} style={{
              alignItems: 'center', backgroundColor: running ? colors.error : colors.primary,
              padding: 12, borderRadius: 10, marginTop: 12,
            }}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>
                {running ? 'Cancel test · ' + fmt(elapsed) : decision || failure ? 'Test again' : 'Start test'}
              </Text>
            </TouchableOpacity>
            {running && diffusionStep === 0 && elapsed >= 90 && (
              <Text style={{ color: '#b78a26', marginTop: 8 }}>
                No diffusion steps after {fmt(elapsed)}. The native engine may be initializing slowly or stalled.
                You can cancel; this does not count as a pass.
              </Text>
            )}
          </View>
          {items.map(item => <View key={item.key} style={[card, { flexDirection: 'row' }]}>
            {item.status === 'run' ?
              <ActivityIndicator size="small" color={colors.primary} style={{ width: 20 }} /> :
              <Icon name={item.status === 'ok' ? 'check-circle' : item.status === 'fail' ?
                'x-circle' : item.status === 'warn' ? 'alert-triangle' : 'circle'}
                size={20} color={tone(item.status)} />}
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={{ color: colors.text, fontWeight: '600' }}>{item.title}</Text>
              {!!item.detail && <Text style={{ color: colors.textSecondary, marginTop: 4 }}>{item.detail}</Text>}
            </View>
          </View>)}
          {!!failure && <View style={card}><Text style={{ color: colors.error }}>Test failed: {failure}</Text></View>}
          {!!result && <View style={card}>
            <Text style={{ color: colors.text, fontWeight: '700' }}>Generated image · {fmt(elapsed)}</Text>
            <Image source={{ uri: imageUri }} resizeMode="contain"
              style={{ width: '100%', height: 330, backgroundColor: colors.background, marginTop: 8 }} />
            <Text style={{ color: colors.textSecondary, marginTop: 8 }}>{SMILE}</Text>
            {decision === 'review' && <Text style={{ color: colors.text, fontWeight: '600', marginTop: 8 }}>
              Does it actually show a yellow smiley face?
            </Text>}
            {decision === 'pass' && <Text style={{ color: colors.success || '#299662', marginTop: 8 }}>
              Visual test passed. The prompt was followed.
            </Text>}
            {decision === 'wrong' && <Text style={{ color: colors.error, marginTop: 8 }}>
              PNG is valid but prompt accuracy failed. Try quality mode without LoRAs or upscaling.
              The model architecture and text conditioning may need investigation.
            </Text>}
            {decision === 'review' && <View style={{ flexDirection: 'row', marginTop: 10 }}>
              <TouchableOpacity onPress={() => {
                setDecision('pass'); update('output', 'ok', 'PNG valid; user confirmed the subject.');
              }} style={bordered(colors.primary)}>
                <Text style={{ color: colors.primary }}>Looks correct</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => {
                setDecision('wrong'); update('output', 'fail', 'PNG valid but prompt not followed.');
              }} style={bordered(colors.error)}>
                <Text style={{ color: colors.error }}>Wrong image</Text>
              </TouchableOpacity>
            </View>}
          </View>}
        </>}
      </ScrollView>
    </SafeAreaView>
  );
};