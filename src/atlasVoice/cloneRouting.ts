/** Small pure helpers shared by the voice picker, agent profiles and native TTS. */
export const isPocketVoiceId = (id: string): boolean =>
  /^sherpa-onnx-pocket-tts(?:-|$)/i.test(id) || /^pocket-tts(?:-|$)/i.test(id);

export function resolveReferenceId(voiceId: string, requested: string | undefined, saved: string | undefined): string {
  if (!isPocketVoiceId(voiceId)) return '';
  return requested ?? saved ?? '';
}

export const voiceReferenceName = (name: string): string => name.trim().replace(/\s+/g, ' ').slice(0, 70) || 'My voice';

export function referenceCanSpeak(voiceId: string, referenceId: string): boolean {
  return !isPocketVoiceId(voiceId) || !!referenceId.trim();
}
