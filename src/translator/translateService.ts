/**
 * Runs the translator's requests on the loaded AI model. Every request goes through the background job queue, so it waits its turn behind
 * a chat reply instead of failing with "busy". The prompts and the parsing are in translate.ts.
 */
import { runBackgroundJob } from '../services/llmJobQueue';
import { llmService } from '../services/llm';
import { ensureTextModel } from '../atlasTools/models';
import { runVision } from '../services/pictureAsk';
import { useAppStore } from '../stores/appStore';
import type { TranslatorLanguage } from './languages';
import { bothWaysMessages, cleanTranslation, parseDirected, parsePicture, pictureMessages, textMessages } from './translate';

async function ask(messages: unknown[], label: string): Promise<string> {
  await ensureTextModel(null);
  return runBackgroundJob(() => llmService.generateResponse(messages as never, { disableThinking: true }), { label, maxWaitMs: 5 * 60_000 });
}

/** Text mode. `from` null lets the AI recognise the language. */
export async function translateText(text: string, from: TranslatorLanguage | null, to: TranslatorLanguage): Promise<string> {
  return cleanTranslation(await ask(textMessages(text, from, to), 'Translating'));
}

/** Conversation mode: the text is in A or B and is translated into the other; says which side it went to (null when the AI did not say). */
export async function translateBothWays(text: string, a: TranslatorLanguage, b: TranslatorLanguage): Promise<{ to: 'A' | 'B' | null; text: string }> {
  return parseDirected(await ask(bothWaysMessages(text, a, b), 'Interpreting'));
}

/** Camera mode: the text in a picture, and its translation. Needs a model that can see pictures. */
export async function translatePicture(uri: string, mimeType: string | undefined, to: TranslatorLanguage): Promise<ReturnType<typeof parsePicture>> {
  return parsePicture(await runVision((attachment) => pictureMessages(attachment, to), { uri, mimeType }, 'Translating a picture'));
}

/** Whether a downloaded model has a vision file attached and switched on (so it can read a picture once it is loaded). */
const hasVisionFile = (m: { engine?: string; mmProjPath?: string; mmProjDisabled?: boolean }): boolean => m.engine !== 'litert' && !!m.mmProjPath && !m.mmProjDisabled;

/** What the camera needs to say about the model: whether the selected one can see pictures, and which other downloaded ones can. */
export function visionChoices(): { selectedCanSee: boolean; selectedName: string | null; others: Array<{ id: string; name: string }> } {
  const st = useAppStore.getState();
  const selected = st.downloadedModels.find((m) => m.id === st.activeModelId);
  return {
    selectedCanSee: !!selected && hasVisionFile(selected as never),
    selectedName: selected?.name ?? null,
    others: st.downloadedModels.filter((m) => m.id !== st.activeModelId && hasVisionFile(m as never)).map((m) => ({ id: m.id, name: m.name })),
  };
}

/** Loads a model that can see pictures, to use for the camera. */
export async function loadVisionModel(id: string): Promise<void> {
  await ensureTextModel(id);
}
