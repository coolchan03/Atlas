/** The two engines the "Compare with GenieX" card measures, as handles for engineCompare.ts. This is the service layer: the card does not import an engine itself. */
import { activeModelService } from './activeModelService';
import { hardwareService } from './hardware';
import { llmService } from './llm';
import { generateGeniex, loadGeniex, unloadGeniex } from './geniexEngine';
import type { EngineHandle } from './engineCompare';
import type { LlamaDownloadedModel, Message } from '../types';
import { localUniqueId } from '../utils/uniqueId';

export const COMPARE_PROMPTS = ['Write one short paragraph about rivers.', 'Explain in two sentences why the sky is blue.', 'List three tips for sleeping well.'];
const MAX_TOKENS = 96;
const roughTokens = (text: string) => Math.ceil(text.length / 3.6);
const msg = (content: string): Message => ({ id: localUniqueId('cmp'), role: 'user', content, timestamp: Date.now() });
const footprint = async (): Promise<number> => (await hardwareService.getProcessMemory())?.footprintMB ?? 0;

/** llama.rn, on whatever backend it is set to use, through the same load path as chat. */
export function llamaHandle(model: LlamaDownloadedModel): EngineHandle {
  return {
    engine: 'llama.rn',
    features: { vision: !!model.mmProjPath, tools: true, mtp: false, qLegacy: true },
    load: async () => { await activeModelService.unloadAllModels(true); const t = Date.now(); await activeModelService.loadTextModel(model.id); return (Date.now() - t) / 1000; },
    reply: async (prompt) => {
      await llmService.generateWithMaxTokens([msg(prompt)], MAX_TOKENS);
      const st = llmService.getPerformanceStats();
      const ttft = st.lastTimeToFirstToken || 0;
      return { ttftSec: ttft, decodeTps: st.lastDecodeTokensPerSecond || st.lastTokensPerSecond || 0, prefillTps: ttft > 0 ? roughTokens(prompt) / ttft : 0 };
    },
    peakRamMB: footprint,
    unload: async () => { await activeModelService.unloadAllModels(true); },
  };
}

/** GenieX, with only what the bridge provides today: text. It does not yet do vision, tools or speculative decoding, and says so. */
export function geniexHandle(model: LlamaDownloadedModel): EngineHandle {
  return {
    engine: 'GenieX',
    features: { vision: false, tools: false, mtp: false, qLegacy: true },
    load: async () => { const t = Date.now(); await loadGeniex(model.filePath, { contextLength: 4096, npu: true }); return (Date.now() - t) / 1000; },
    reply: async (prompt) => {
      const r = await generateGeniex([{ role: 'user', content: prompt }], { maxTokens: MAX_TOKENS });
      return { ttftSec: r.timings.ttftMs / 1000, decodeTps: r.timings.decodeTps, prefillTps: r.timings.prefillTps };
    },
    peakRamMB: footprint,
    unload: unloadGeniex,
  };
}
