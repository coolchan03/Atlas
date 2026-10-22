import React from 'react';
import { ActivityIndicator, Image, ScrollView, Share, Switch, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import { Button } from '../components/Button';
import { ImageBackendModePicker } from '../components/ImageBackendModePicker';
import { useTheme, useThemedStyles } from '../theme';
import type { ThemeColors } from '../theme';
import type { GeneratedImage, ONNXImageModel } from '../types';
import type { NativeImageRuntimeStatus, localDreamGeneratorService } from '../services/localDreamGenerator';
import type { ImageTestMode, imageTestPreset } from '../utils/nativeImageTuning';
import { createImageTestStyles } from './ImageModelTestScreen.styles';

export type ImageTestStatus = 'wait' | 'run' | 'ok' | 'warn' | 'fail';
export type ImageTestItem = { key: string; title: string; status: ImageTestStatus; detail: string };
export type ImageTestDecision = 'engine' | 'review' | 'pass' | 'wrong' | null;
export type ImageGpuDiagnostic = Awaited<ReturnType<typeof localDreamGeneratorService.getNativeImageGpuDiagnostics>>;
type CpuState = 'active' | 'idle' | 'unknown';

export interface ImageModelTestScreenViewProps {
  model?: ONNXImageModel;
  testMode: ImageTestMode;
  cfg: ReturnType<typeof imageTestPreset> | null;
  includeLoRA: boolean;
  includeUpscaler: boolean;
  running: boolean;
  elapsed: number;
  canForce: boolean;
  probingGpu: boolean;
  gpuDiagnostic: ImageGpuDiagnostic | null;
  gpuProbeError: string | null;
  runtime: NativeImageRuntimeStatus | null;
  diffusionStep: number;
  cpuState: CpuState;
  items: ImageTestItem[];
  result: GeneratedImage | null;
  decision: ImageTestDecision;
  failure: string | null;
  prompt: string;
  onBack: () => void;
  onMode: (mode: ImageTestMode) => void;
  onLoRA: (enabled: boolean) => void;
  onUpscaler: (enabled: boolean) => void;
  onCheckGpu: () => void;
  onStart: (force?: boolean) => void;
  onCancel: () => void;
  onDecision: (decision: 'pass' | 'wrong') => void;
}
type ViewContext = ImageModelTestScreenViewProps & {
  colors: ThemeColors;
  styles: ReturnType<typeof createImageTestStyles>;
};

export const formatTestElapsed = (seconds: number) => `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
const MODE_OPTIONS = [
  ['smoke', '1-step engine test'], ['quick', 'Short render'], ['quality', 'Quality render'],
] as const;
const MODE_HELP: Record<ImageTestMode, string> = {
  smoke: '. Only checks engine inference; image quality will be poor.',
  quick: '. Low-step diagnostic; image quality is not representative.',
  quality: '. Full quality uses much more RAM and may take a long time on CPU.',
};

function TestConfiguration(p: ViewContext) {
  if (!p.model) return null;
  return <>
    <Text style={p.styles.title}>{p.model.name}</Text>
    <Text style={[p.styles.secondary, p.styles.spaced]}>Fixed test: yellow smiley face, seed 42, no LLM prompt rewriting.</Text>
    <View style={p.styles.modeRow}>
      {MODE_OPTIONS.map(([key, label]) => <Button key={key} title={label} size="small"
        variant={p.testMode === key ? 'primary' : 'secondary'} disabled={p.running}
        onPress={() => p.onMode(key)} style={p.styles.modeButton} />)}
    </View>
    <Text style={[p.styles.muted, p.styles.spaced]}>
      {p.cfg?.width}x{p.cfg?.height} ? {p.cfg?.steps} steps ? CFG {p.cfg?.guidanceScale}
      {MODE_HELP[p.testMode]}
    </Text>
  </>;
}

function ImageGpuControls(p: ViewContext) {
  if (p.model?.backend !== 'sdcpp') return null;
  const diagnostic = p.gpuDiagnostic;
  return <>
    <ImageBackendModePicker backend={p.model.backend} />
    <Text style={p.styles.small}>If Vulkan and OpenCL are unavailable, select CPU above and run the test again. CPU generation may be very slow.</Text>
    <View style={[p.styles.switchRow, p.styles.spaced]}>
      <Text style={p.styles.switchLabel}>Include style LoRAs</Text>
      <Switch accessibilityLabel="Include style LoRAs" disabled={p.running} value={p.includeLoRA} onValueChange={p.onLoRA} />
    </View>
    <View style={p.styles.switchRow}>
      <Text style={p.styles.switchLabel}>Include ESRGAN upscaler</Text>
      <Switch accessibilityLabel="Include ESRGAN upscaler" disabled={p.running} value={p.includeUpscaler} onValueChange={p.onUpscaler} />
    </View>
    <Text style={p.styles.small}>Both off by default. RealESRGAN_x4plus.pth is a 4x upscaler, not a style LoRA.</Text>
    <Button disabled={p.running || p.probingGpu} onPress={p.onCheckGpu} style={p.styles.action}
      title={p.probingGpu ? 'Checking Vulkan hardware...' : 'Check GPU without loading the model'} />
    {diagnostic && <View style={p.styles.spaced}>
      <Text selectable style={[p.styles.small, !diagnostic.enumerated && p.styles.error]}>
        {diagnostic.enumerated ? 'Vulkan device recognized.' : 'GPU probe inconclusive.'}
        {' '}Android reports Vulkan: {diagnostic.androidVulkanFeature ? 'yes' : 'not advertised'}.
        {' '}Backend: {diagnostic.backend}.
        {' '}Native log: {diagnostic.nativeOutput}
      </Text>
      <Button title="Share GPU diagnostics" variant="ghost" size="small" onPress={() => {
        Share.share({ message: `Atlas Vulkan probe - ${diagnostic.detail}\nDevice list: ${diagnostic.nativeOutput}` }).catch(() => {});
      }} />
    </View>}
    {p.gpuProbeError && <Text selectable style={[p.styles.small, p.styles.error]}>
      GPU check error: {p.gpuProbeError}
    </Text>}
  </>;
}

function TestRunControls(p: ViewContext) {
  const title = p.running ? `Cancel test · ${formatTestElapsed(p.elapsed)}`
    : p.decision || p.failure ? 'Test again' : 'Start test';
  return <>
    <Button title={title} onPress={p.running ? p.onCancel : () => p.onStart()}
      variant={p.running ? 'danger' : 'primary'} style={p.styles.action} />
    {p.canForce && !p.running && <View style={p.styles.action}>
      <Button title="Load anyway" testID="model-test-load-anyway" variant="danger" onPress={() => p.onStart(true)} />
      <Text style={[p.styles.small, p.styles.spaced]}>May close other apps or crash if memory runs out</Text>
    </View>}
  </>;
}

function stalledDetail(runtime: NativeImageRuntimeStatus | null, cpuState: CpuState) {
  if (runtime?.computeBackend?.includes('Vulkan')) {
    return runtime.secondsSinceLog >= 60
      ? 'Vulkan process has produced no recent output. GPU execution cannot be confirmed; it may be stalled. Try cancelling or switching to CPU explicitly.'
      : 'Vulkan requested; recent native output is not proof of successful GPU compute. Check whether diffusion steps advance.';
  }
  return cpuState === 'active'
    ? 'Native CPU use is increasing; it is computing, even if progress is unchanged.'
    : 'Step progress has not advanced. This may be slow or stalled. Cancel and try the 1-step test or a smaller quantized model.';
}

function elapsedDetail(label: string, seconds?: number, missing = '') {
  return seconds !== undefined && seconds >= 0 ? ` ${label} ${Math.round(seconds)} seconds ago.` : missing;
}
const CPU_LABEL: Record<CpuState, string> = {
  active: 'active', idle: 'no increase on last sample', unknown: 'unavailable',
};

function NativeImageDiagnostics(p: ViewContext) {
  if (p.model?.backend !== 'sdcpp' || !p.running || p.elapsed < 30) return null;
  const runtime = p.runtime;
  return <View style={p.styles.action}>
    <Text selectable style={p.styles.secondary}>
      Native process: {runtime?.running ? 'alive' : 'starting or unavailable'}.
      {' '}Compute: {runtime?.computeBackend || 'detecting'}.
      {' '}Precision: {runtime?.weightPrecision || 'detecting'}.
      {' '}Stage: {runtime?.stage || 'awaiting diagnostics'}.
      {' '}Step: {runtime?.step ?? p.diffusionStep}/{runtime?.totalSteps || p.cfg?.steps}.
      {' '}Host CPU: {CPU_LABEL[p.cpuState]}.
      {' '}{runtime?.deviceLabel || ''}.
      {elapsedDetail('Last completed step', runtime?.secondsSinceStep, ' No completed diffusion step reported yet.')}
      {elapsedDetail('Last engine output', runtime?.secondsSinceLog)}
    </Text>
    {p.elapsed >= 120 && <Text style={[p.styles.secondary, p.styles.warning, p.styles.spaced]}>
      {stalledDetail(runtime, p.cpuState)}
    </Text>}
  </View>;
}

function TestStatusList(p: ViewContext) {
  const tone: Record<ImageTestStatus, string> = {
    ok: p.colors.success, fail: p.colors.error, warn: p.colors.warning,
    run: p.colors.primary, wait: p.colors.textMuted,
  };
  const icon: Record<ImageTestStatus, string> = {
    ok: 'check-circle', fail: 'x-circle', warn: 'alert-triangle', run: 'circle', wait: 'circle',
  };
  return <>{p.items.map(item => <View key={item.key} style={[p.styles.card, p.styles.row]}>
    {item.status === 'run' ? <ActivityIndicator size="small" color={p.colors.primary} style={p.styles.spinner} />
      : <Icon name={icon[item.status]} size={20} color={tone[item.status]} />}
    <View style={p.styles.statusBody}>
      <Text style={p.styles.label}>{item.title}</Text>
      {!!item.detail && <Text style={p.styles.detail}>{item.detail}</Text>}
    </View>
  </View>)}</>;
}

function ImageTestResult(p: ViewContext) {
  if (!p.result) return null;
  const imagePath = p.result.imagePath;
  const imageUri = imagePath.startsWith('file://') ? imagePath : `file://${imagePath}`;
  return <View style={p.styles.card}>
    <Text style={p.styles.label}>Generated image · {formatTestElapsed(p.elapsed)}</Text>
    <Image source={{ uri: imageUri }} resizeMode="contain" style={p.styles.preview} />
    <Text style={[p.styles.secondary, p.styles.spaced]}>{p.prompt}</Text>
    {p.decision === 'engine' && <Text style={[p.styles.body, p.styles.success, p.styles.spaced]}>
      Native engine completed one diffusion step and saved a PNG. This does not
      test prompt accuracy; select Short render or Quality render for that.
    </Text>}
    {p.decision === 'review' && <Text style={[p.styles.label, p.styles.spaced]}>
      Does it actually show a yellow smiley face?
    </Text>}
    {p.decision === 'pass' && <Text style={[p.styles.body, p.styles.success, p.styles.spaced]}>
      Visual test passed. The prompt was followed.
    </Text>}
    {p.decision === 'wrong' && <Text style={[p.styles.body, p.styles.error, p.styles.spaced]}>
      PNG is valid but prompt accuracy failed. Try quality mode without LoRAs or upscaling.
      The model architecture and text conditioning may need investigation.
    </Text>}
    {p.decision === 'review' && <View style={[p.styles.row, p.styles.action]}>
      <Button title="Looks correct" onPress={() => p.onDecision('pass')} style={p.styles.modeButton} />
      <Button title="Wrong image" onPress={() => p.onDecision('wrong')} variant="danger" />
    </View>}
  </View>;
}

export function ImageModelTestScreenView(props: ImageModelTestScreenViewProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createImageTestStyles);
  const context = { ...props, colors, styles };
  return <SafeAreaView style={styles.screen} edges={['top']}>
    <View style={styles.header}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back" onPress={props.onBack} style={styles.back}>
        <Icon name="arrow-left" size={22} color={colors.text} />
      </TouchableOpacity>
      <Text style={styles.heading}>Test image model</Text>
    </View>
    <ScrollView contentContainerStyle={styles.content}>
      {!props.model ? <Text style={[styles.body, styles.error]}>Image model not found.</Text> : <>
        <View style={styles.card}>
          <TestConfiguration {...context} />
          <ImageGpuControls {...context} />
          <TestRunControls {...context} />
          <NativeImageDiagnostics {...context} />
        </View>
        <TestStatusList {...context} />
        {!!props.failure && <View style={styles.card}>
          <Text style={[styles.body, styles.error]}>Test failed: {props.failure}</Text>
        </View>}
        <ImageTestResult {...context} />
      </>}
    </ScrollView>
  </SafeAreaView>;
}
