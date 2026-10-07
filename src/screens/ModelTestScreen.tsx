import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../theme';
import { useAppStore } from '../stores';
import { activeModelService } from '../services/activeModelService';
import { llmService } from '../services/llm';
import { liteRTService } from '../services/litert';
import { hardwareService } from '../services/hardware';
import type { Message } from '../types';
import { useSpeedStats, estimateReply, fmtSec, speedHealthLabel } from '../atlasTools/speed';
import { localUniqueId } from '../utils/uniqueId';

type Status = 'wait' | 'run' | 'ok' | 'warn' | 'fail' | 'skip';
interface Step { key: string; title: string; status: Status; detail: string }

const STEPS: Array<Pick<Step, 'key' | 'title'>> = [
  { key: 'fit', title: 'Fits in memory' },
  { key: 'load', title: 'Loads' },
  { key: 'speed', title: 'Writing speed' },
  { key: 'read', title: 'Reading speed (long documents)' },
  { key: 'ctx', title: 'Memory size (context)' },
  { key: 'accel', title: 'GPU / NPU' },
  { key: 'extras', title: 'Abilities' },
];

const LONG_TEXT = Array.from({ length: 40 }, (_, i) =>
  `Section ${i + 1}. A traveller walked along the river, counting stones and noting the weather, the birds and the colour of the water before the evening rain.`,
).join(' ');

const msg = (content: string, role: Message['role'] = 'user'): Message => ({ id: localUniqueId('test'), role, content, timestamp: Date.now() });

const tps0 = (v: { text: string }) => /slow/i.test(v.text);
const speedWords = (tps: number) => {
  const health = speedHealthLabel(tps);
  if (health === 'slow') return 'slow - you will wait for each answer';
  if (health === 'usable') return 'about reading speed - fine for chatting';
  if (health === 'good') return 'good - faster than you can read';
  return health;
};

/** Runs a model through a quick check: will it fit, does it load, how fast it writes and reads, what it can do. */
export const ModelTestScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { colors } = useTheme();
  const modelId: string = route.params?.modelId;
  const model = useAppStore((s) => s.downloadedModels.find((m) => m.id === modelId));
  const [steps, setSteps] = useState<Step[]>(STEPS.map((s) => ({ ...s, status: 'wait', detail: '' })));
  const [running, setRunning] = useState(false);
  const [verdict, setVerdict] = useState<{ good: boolean; text: string } | null>(null);
  const [prevId, setPrevId] = useState<string | null>(null);
  const [faster, setFaster] = useState<string | null>(null);
  const cancelled = useRef(false);
  useEffect(() => () => { cancelled.current = true; }, []);

  const set = (key: string, status: Status, detail: string) =>
    setSteps((all) => all.map((s) => (s.key === key ? { ...s, status, detail } : s)));

  const run = async () => {
    if (!model || running) return;
    cancelled.current = false;
    setRunning(true);
    setVerdict(null);
    setFaster(null);
    setSteps(STEPS.map((s) => ({ ...s, status: 'wait', detail: '' })));
    const store = useAppStore.getState();
    const before = store.activeModelId;
    setPrevId(before && before !== model.id ? before : null);
    const isLite = model.engine === 'litert';
    let ok = true;
    let tps = 0;
    try {
      if (llmService.isCurrentlyGenerating()) {
        throw new Error('A chat answer is still being written. Wait for it to finish, then test again.');
      }
      // 1. Memory
      set('fit', 'run', 'Checking...');
      const mem = await activeModelService.checkMemoryForModel(model.id, 'text');
      const total = hardwareService.getTotalMemoryGB();
      const need = `needs about ${mem.requiredMemoryGB.toFixed(1)} GB; ${mem.availableMemoryGB.toFixed(1)} GB usable of ${total.toFixed(0)} GB`;
      if (!mem.canLoad) { set('fit', 'fail', `Too big for this device (${need}). Try a smaller or more compressed version (Q4).`); ok = false; throw new Error(''); }
      set('fit', mem.severity === 'warning' ? 'warn' : 'ok', mem.severity === 'warning' ? `Tight (${need}). Other apps may get closed.` : `Yes (${need})`);
      if (cancelled.current) return;

      // 2. Load
      set('load', 'run', before === model.id ? 'Already loaded' : 'Loading... (can take a minute)');
      const t0 = Date.now();
      await activeModelService.loadTextModel(model.id);
      const loadS = (Date.now() - t0) / 1000;
      set('load', 'ok', before === model.id && loadS < 1 ? 'Already loaded' : `Loaded in ${loadS.toFixed(1)} s`);
      if (cancelled.current) return;

      // 3. Writing speed
      set('speed', 'run', 'Writing a short paragraph...');
      const keptOutLen = useSpeedStats.getState().byModel[model.id]?.outLen || 0; // the test paragraph isn't a typical answer
      let sample = '';
      if (isLite) {
        liteRTService.invalidateConversation();
        sample = await liteRTService.generateRaw('Write one short paragraph (about 60 words) about rivers. No title.');
        const st = liteRTService.getLastBenchmarkStats();
        tps = st?.decodeTokensPerSecond || 0;
      } else {
        sample = await llmService.generateResponse([msg('Write one short paragraph (about 60 words) about rivers. No title.')], { disableThinking: true });
        const st = llmService.getPerformanceStats();
        tps = st.lastDecodeTokensPerSecond || st.lastTokensPerSecond || 0;
      }
      if (keptOutLen) useSpeedStats.setState((st) => st.byModel[model.id] ? { byModel: { ...st.byModel, [model.id]: { ...st.byModel[model.id], outLen: keptOutLen } } } : st);
      if (!sample.trim()) { set('speed', 'fail', 'The model loaded but wrote nothing. The file may be damaged or not a chat model.'); ok = false; }
      else set('speed', tps < 3 ? 'warn' : 'ok', `${tps.toFixed(1)} word-pieces per second: ${speedWords(tps)}.\nSample: "${sample.trim().slice(0, 160)}${sample.length > 160 ? '...' : ''}"`);
      if (cancelled.current) return;

      // 4. Reading speed (prompt processing)
      set('read', 'run', 'Reading a long passage...');
      try {
        let readTps = 0;
        if (isLite) {
          liteRTService.invalidateConversation();
          await liteRTService.generateRaw(`${LONG_TEXT}\n\nIn one word, what was the traveller counting?`);
          const st = liteRTService.getLastBenchmarkStats();
          readTps = st?.prefillTokensPerSecond || 0;
        } else {
          const n = (await llmService.tokenize(LONG_TEXT)).length;
          const t1 = Date.now();
          await llmService.generateWithMaxTokens([msg(`${LONG_TEXT}\n\nIn one word, what was the traveller counting?`)], 4);
          readTps = n / Math.max(0.05, (Date.now() - t1) / 1000);
          useSpeedStats.getState().record(model.id, { prefill: readTps });
        }
        const pageSec = readTps > 0 ? 500 / readTps : 0; // ~500 tokens per page
        set('read', readTps > 0 && readTps < 40 ? 'warn' : 'ok', readTps > 0
          ? `About ${Math.round(readTps)} pieces per second - roughly ${pageSec < 1 ? 'under a second' : `${pageSec.toFixed(0)} s`} per page of a document.`
          : 'Done (speed not reported by this engine).');
      } catch (e: any) { set('read', 'warn', `Could not measure: ${e?.message || e}`); }
      if (cancelled.current) return;

      // 5. Context
      const maxCtx = useAppStore.getState().modelMaxContext;
      const usedCtx = isLite ? liteRTService.getContextUsage().max : llmService.getPerformanceSettings().contextLength;
      const kWords = (n: number) => `${(n / 1024).toFixed(0)}K (about ${Math.round((n * 0.75) / 1000)} thousand words)`;
      set('ctx', 'ok', `Running with ${usedCtx ? kWords(usedCtx) : 'unknown'}${!isLite && maxCtx ? `; the model can go up to ${kWords(maxCtx)}` : ''}. Change it in Chat settings > Memory size. Bigger uses more RAM and gets slower.`);

      // 6. Acceleration
      if (isLite) {
        const be = liteRTService.getActiveBackend();
        set('accel', be === 'cpu' ? 'warn' : 'ok', be === 'npu' ? 'Running on the NPU' : be === 'gpu' ? 'Running on the GPU' : 'Running on the CPU only');
      } else {
        const g = llmService.getGpuInfo();
        let qualcomm = false;
        try { qualcomm = (await hardwareService.getSoCInfo()).vendor === 'qualcomm'; } catch { /* unknown */ }
        if (qualcomm && !/q4_0|q8_0/i.test(model.fileName || '')) setFaster('A Q4_0 version of this model can run on the Snapdragon GPU and is usually much faster.');
        const quant = !qualcomm || /q4_0|q8_0/i.test(model.fileName || '') ? '' : ' This file type speeds up less on the GPU - a Q4_0 or Q8_0 version is fastest on Snapdragon.';
        const note = llmService.getBackendFallbackNotice();
        if (llmService.isCpuForFileType()) set('accel', 'ok', 'CPU on purpose: the GPU/NPU only speed up Q4_0 and Q8_0 files, so this file type is faster on the CPU. A Q4_0 version of this model can use the GPU.');
        else set('accel', g.gpu ? 'ok' : 'warn', g.gpu ? `GPU (${g.gpuBackend || 'on'}), ${g.gpuLayers} layers.${quant}` : `CPU only.${note ? ` ${note}` : ' Turn on the GPU in Settings > Text generation.'}${quant}`);
      }

      // 7. Abilities
      const abil: string[] = [];
      if (isLite) { abil.push((model as any).liteRTVision ? 'sees pictures' : 'text only'); }
      else {
        abil.push(llmService.supportsVision() ? 'sees pictures' : 'text only');
        abil.push(llmService.supportsToolCalling() ? 'can use tools (search, files, notes)' : 'no tool use');
        abil.push(llmService.supportsThinking() ? 'can think step by step' : 'no thinking mode');
      }
      set('extras', 'ok', abil.join(' · '));

      const q = estimateReply(model.id, 40);
      const doc = estimateReply(model.id, 3000);
      const timing = q ? `\n\nA normal answer takes about ${fmtSec(q.totalSec)} (first words after ${fmtSec(q.firstWordsSec)}).${doc ? ` With a 6-page document attached, first words come after about ${fmtSec(doc.firstWordsSec)}.` : ''} Thinking makes answers take 2-4 times longer.` : '';
      setVerdict(ok
        ? { good: tps >= 3, text: (tps >= 3 ? 'This model works well on this device.' : 'This model works, but answers will be slow. A smaller model will feel much faster.') + timing }
        : { good: false, text: 'This model had a problem. See the red line above.' });
    } catch (e: any) {
      const m = e?.message || String(e || '');
      setSteps((all) => {
        const cur = all.find((s) => s.status === 'run');
        return cur ? all.map((s) => (s === cur ? { ...s, status: 'fail', detail: m || 'Failed' } : s)) : all;
      });
      setVerdict({ good: false, text: m ? `Did not pass: ${m}` : 'Did not pass. See above.' });
    } finally {
      setRunning(false);
    }
  };

  const goBackToPrev = async () => {
    if (!prevId) return;
    try { await activeModelService.unloadTextModel(false); } catch { /* ignore */ }
    useAppStore.getState().setActiveModelId(prevId);
    setPrevId(null);
  };

  const icon = (s: Status) => ({ wait: ['circle', colors.textMuted], run: ['loader', colors.primary], ok: ['check-circle', colors.success ?? '#3a9d5d'], warn: ['alert-triangle', '#d4a017'], fail: ['x-circle', colors.error], skip: ['minus-circle', colors.textMuted] } as Record<Status, [string, string]>)[s];
  const card = { backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginBottom: 10 };
  const prevName = useAppStore((s) => s.downloadedModels.find((m) => m.id === prevId)?.name);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12 }}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 6 }}><Icon name="arrow-left" size={22} color={colors.text} /></TouchableOpacity>
        <Text style={{ color: colors.text, fontSize: 22, fontWeight: '700', fontFamily: 'serif', marginLeft: 8, flex: 1 }}>Test model</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 60, width: '100%', maxWidth: 900, alignSelf: 'center' }}>
        {!model ? <Text style={{ color: colors.textMuted }}>Model not found.</Text> : (
          <>
            <View style={card}>
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16 }}>{model.name}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>{model.fileName} · {hardwareService.formatModelSize(model)}</Text>
              <Text style={{ color: colors.textSecondary, marginTop: 8 }}>Checks whether this model fits, loads, how fast it writes and reads, and what it can do. Takes about a minute. The model stays loaded afterwards.</Text>
              <TouchableOpacity onPress={run} disabled={running} style={{ marginTop: 12, backgroundColor: running ? colors.border : colors.primary, borderRadius: 10, paddingVertical: 12, alignItems: 'center' }}>
                {running ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>{verdict ? 'Test again' : 'Start test'}</Text>}
              </TouchableOpacity>
            </View>
            {steps.map((s) => {
              const [name, color] = icon(s.status);
              return (
                <View key={s.key} style={[card, { flexDirection: 'row' }]}>
                  {s.status === 'run' ? <ActivityIndicator size="small" color={colors.primary} style={{ width: 20 }} /> : <Icon name={name} size={20} color={color} />}
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={{ color: colors.text, fontWeight: '600' }}>{s.title}</Text>
                    {!!s.detail && <Text style={{ color: colors.textSecondary, marginTop: 3 }}>{s.detail}</Text>}
                  </View>
                </View>
              );
            })}
            {!!verdict && (
              <View style={[card, { borderWidth: 1, borderColor: verdict.good ? (colors.success ?? '#3a9d5d') : ('#d4a017') }]}>
                <Text style={{ color: colors.text, fontWeight: '700' }}>{verdict.text}</Text>
                {!!faster && !running && (
                  <TouchableOpacity onPress={() => navigation.navigate('Main', { screen: 'ModelsTab', params: { initialTab: 'text', initialSearchQuery: model.name.replace(/[-_. ]?(i?q\d[\w]*|f16|bf16|gguf)$/gi, '').trim() } })} style={{ marginTop: 10 }}>
                    <Text style={{ color: colors.primary }}>{faster} Find it</Text>
                  </TouchableOpacity>
                )}
                {!!verdict && !verdict.good && tps0(verdict) && !running && (
                  <TouchableOpacity onPress={() => navigation.navigate('Main', { screen: 'ModelsTab', params: { initialTab: 'text' } })} style={{ marginTop: 10 }}>
                    <Text style={{ color: colors.primary }}>Browse smaller models</Text>
                  </TouchableOpacity>
                )}
                {!!prevId && !running && (
                  <TouchableOpacity onPress={goBackToPrev} style={{ marginTop: 10 }}>
                    <Text style={{ color: colors.primary }}>Switch back to {prevName || 'the previous model'}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};
