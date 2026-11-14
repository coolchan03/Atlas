import { NativeModules, Platform } from 'react-native';
import logger from '../utils/logger';
import { loadVoiceForSpeech } from './neural';
import { readVoiceProfile } from './readAloud';

/**
 * The cloning voice's hidden lab: the same sentence generated at several quality steps with the chosen cloned voice, each saved
 * as a WAV file and measured, plus the reference recording's own numbers. Reached by tapping the version in About seven times.
 * It exists to tell apart a generation problem (the saved file already glitches) from an output problem (the file is clean but
 * plays badly through the voice's output).
 */
const Native: any = NativeModules.AtlasTts;

export interface LabStats {
  samples: number; seconds: number; peak: number; rms: number; clippedPercent: number;
  leadSilenceMs: number; trailSilenceMs: number; longestGapMs: number; bursts: number; noiseFloorDb: number;
}
export interface LabRun { label: string; steps: number; millis: number; audioRate: number; engineRate: number; path: string; stats?: LabStats; error?: string }
export interface LabReport { referenceRate: number; reference?: LabStats; folder: string; runs: LabRun[] }

export const labAvailable = (): boolean => Platform.OS === 'android' && !!Native?.voiceLab;
export const DEFAULT_LAB_TEXT = 'Hey man how is it going';
export const LAB_STEPS = [2, 3, 5];

const SYLLABLE_VOWELS = /[aeiouy]+/gi;
/** A rough count of syllables, to compare with how many separate bursts of sound a recording has. */
export const roughSyllables = (text: string): number => Math.max(1, (text.toLowerCase().match(SYLLABLE_VOWELS) ?? []).length);

/** Loads the Read aloud voice (waiting for the engine to be ready with its recording), then runs the lab. */
export async function runVoiceLab(text: string, steps: number[]): Promise<{ report: LabReport; voice: string }> {
  if (!labAvailable()) throw new Error('The voice lab needs the Android app with the cloning voice.');
  const profile = readVoiceProfile();
  if (!profile?.referenceId) throw new Error('Choose a cloned voice (one with a recording) under Read aloud first.');
  await loadVoiceForSpeech(profile.voiceId, profile.sid, profile.referenceId);
  const report: LabReport = await Native.voiceLab(text, steps);
  const voice = profile.name;
  logger.log(`[VoiceLab] ${formatReport(report, text, voice)}`);
  return { report, voice };
}

export const playThroughVoice = (path: string): Promise<boolean> => Native.labPlayThroughVoice(path);
export const playWithAndroid = (path: string): Promise<boolean> => Native.labPlayWithAndroid(path);
export const stopLab = (): Promise<boolean> => Native?.labStop?.() ?? Promise.resolve(true);

const f = (n: number, digits = 2) => (Number.isFinite(n) ? n.toFixed(digits) : '?');

/** What the numbers suggest, in plain words. Each line says what was seen and what it points to; none of them is proof. */
export function findings(report: LabReport, text: string): string[] {
  const out: string[] = [];
  const syllables = roughSyllables(text);
  const ref = report.reference;
  if (ref) {
    if (ref.seconds < 5 || ref.seconds > 12) out.push(`The reference recording is ${f(ref.seconds, 1)} s; the voice works best with 5 to 12 s of clear speech.`);
    if (ref.clippedPercent > 0.5) out.push(`The reference recording is clipped (${f(ref.clippedPercent, 1)}% of samples at full scale): record it again, quieter or farther from the microphone.`);
    if (ref.noiseFloorDb > -45) out.push(`The reference recording is noisy (quietest part at ${f(ref.noiseFloorDb, 0)} dB): a quieter room gives a cleaner clone.`);
    if (ref.peak < 0.1) out.push('The reference recording is very quiet; record it closer to the microphone.');
  }
  const good = report.runs.filter((r) => r.stats && !r.error);
  for (const r of report.runs) if (r.error) out.push(`${r.label}: failed (${r.error}).`);
  for (const r of good) {
    const s = r.stats!;
    if (r.audioRate !== r.engineRate) out.push(`${r.label}: the file is ${r.audioRate} Hz but the engine reports ${r.engineRate} Hz. If the voice plays too fast, slow or pitched, this is the cause.`);
    const rtf = r.millis / 1000 / Math.max(s.seconds, 0.01);
    if (rtf > 1) out.push(`${r.label}: it took ${f(r.millis / 1000, 1)} s to make ${f(s.seconds, 1)} s of speech. Slower than real time stalls while streaming long text.`);
    if (s.bursts > syllables * 2 + 2) out.push(`${r.label}: ${s.bursts} separate bursts of sound for about ${syllables} syllables. More than twice as many points to stuttering or repeating inside the file itself.`);
    if (s.longestGapMs > 600) out.push(`${r.label}: a ${s.longestGapMs} ms silence in the middle of the phrase.`);
    if (s.trailSilenceMs > 1200 || s.seconds > syllables * 0.6 + 2) out.push(`${r.label}: ${f(s.seconds, 1)} s for a ${syllables}-syllable phrase, with ${s.trailSilenceMs} ms of silence at the end. The voice kept going after the words ended.`);
    if (s.clippedPercent > 0.5) out.push(`${r.label}: the output is clipped (${f(s.clippedPercent, 1)}%), which sounds harsh or distorted.`);
  }
  if (good.length > 1) {
    const durations = good.map((r) => r.stats!.seconds);
    const spread = Math.max(...durations) - Math.min(...durations);
    if (spread > 1) out.push(`The runs differ in length by ${f(spread, 1)} s. The same sentence should take about the same time at any step count; a large difference means the voice is not stopping reliably.`);
  }
  if (!out.length) out.push('Nothing in the numbers looks wrong. Play each file both ways: if a file sounds clean with Android\'s player but glitches through the voice output, the problem is in playback, not in the voice.');
  return out;
}

/** The whole report as plain text, to copy or to read in the debug log. */
export function formatReport(report: LabReport, text: string, voice: string): string {
  const lines = [`Voice lab: "${text}" in ${voice}`];
  const ref = report.reference;
  if (ref) lines.push(`reference: ${f(ref.seconds, 1)} s at ${report.referenceRate} Hz, peak ${f(ref.peak)}, rms ${f(ref.rms, 3)}, clipped ${f(ref.clippedPercent, 2)}%, noise floor ${f(ref.noiseFloorDb, 0)} dB`);
  for (const r of report.runs) {
    if (!r.stats) { lines.push(`${r.label}: failed (${r.error ?? 'unknown'})`); continue; }
    const s = r.stats;
    lines.push(`${r.label}: ${r.millis} ms to make ${f(s.seconds, 2)} s (${f(r.millis / 1000 / Math.max(s.seconds, 0.01))}x real time), ${r.audioRate} Hz (engine ${r.engineRate}), peak ${f(s.peak)}, clipped ${f(s.clippedPercent, 2)}%, lead ${s.leadSilenceMs} ms, trail ${s.trailSilenceMs} ms, longest gap ${s.longestGapMs} ms, ${s.bursts} bursts`);
  }
  lines.push(`files: ${report.folder}`);
  lines.push(...findings(report, text).map((x) => `- ${x}`));
  return lines.join('\n');
}
