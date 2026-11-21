import { isPocketVoiceId, referenceCanSpeak, resolveReferenceId, voiceReferenceName } from '../../../src/atlasVoice/cloneRouting';

describe('on-device cloned voice selection', () => {
  it('recognizes only Pocket TTS voice-cloning families, not a standard neural speaker', () => {
    expect(isPocketVoiceId('sherpa-onnx-pocket-tts-int8-2026-01-26')).toBe(true);
    expect(isPocketVoiceId('pocket-tts-int8')).toBe(true);
    expect(isPocketVoiceId('kitten-nano-en')).toBe(false);
    expect(isPocketVoiceId('kokoro-v1-en')).toBe(false);
  });
  it('requires a reference sample for Pocket TTS', () => {
    expect(referenceCanSpeak('pocket-tts-int8', '')).toBe(false);
    expect(referenceCanSpeak('pocket-tts-int8', 'ref-123')).toBe(true);
    expect(referenceCanSpeak('piper-ryan', '')).toBe(true);
  });
  it('clears stale references on non-cloning voices and retains explicitly requested ones', () => {
    expect(resolveReferenceId('piper-amy', 'old', 'saved')).toBe('');
    expect(resolveReferenceId('pocket-tts-int8', 'requested', 'saved')).toBe('requested');
    expect(resolveReferenceId('pocket-tts-int8', undefined, 'saved')).toBe('saved');
  });
  it('sanitizes the voice display name', () => {
    expect(voiceReferenceName('  A   voice  ')).toBe('A voice');
  });
});
