import { useChatStore } from '../stores/chatStore';
import { useUiModeStore } from '../stores/uiModeStore';
import { prepareMessageForSpeech } from '../utils/messageContent';
import { appendSpeechStream, beginSpeechStream, endSpeechStream, stopsSoFar, ttsAvailable } from './tts';
import { loadVoiceForSpeech, restoreSavedVoice } from './neural';
import { profileForConversation, type VoiceProfile } from './profiles';
import { useAtlasVoiceStore } from './store';

/**
 * Call mode speaks a reply sentence by sentence while the AI is still writing it, so the answer starts
 * after the first sentence instead of after the whole reply, like a person on the phone. Without this
 * the voice waited for the full reply, then generated it: a long silence after every question.
 *
 * An agent with a voice of its own (a cloned or chosen voice) streams too: its voice is loaded FIRST, then the stream
 * starts, and the sentences written meanwhile are spoken as soon as it is ready. If that voice cannot be loaded or cannot
 * take streamed text, or the reply is stopped or interrupted, the reply is spoken the old way.
 */
interface Session { /** Empty until the stream has begun (an agent's own voice is loaded before it can begin). */ key: string; replyId: string; sent: number; lastAnswer: string; chain: Promise<unknown>; usable: boolean; /** The person stopped the voice while an agent's voice was still loading: the reply stays unspoken. */ silenced?: boolean }

let session: Session | null = null;
/** The reply that must not be spoken any more (it was interrupted, or cannot be streamed). */
let dropped: string | null = null;

/** Where the complete sentences in `text` end, searching from `from`. */
export function sentenceEnd(text: string, from: number): number {
  const end = /(?:[.!?]+["')\]]*\s+|\n+)/g;
  end.lastIndex = from;
  let cut = from;
  for (let m = end.exec(text); m; m = end.exec(text)) cut = m.index + m[0].length;
  // A long first sentence with commas: start at a comma instead of waiting for its full stop.
  if (cut === from && from === 0 && text.length > 150) {
    const comma = text.lastIndexOf(', ');
    if (comma > 40) return comma + 2;
  }
  return cut;
}

const replyIdFor = (conversationId: string, offset = 0) => {
  const conv = useChatStore.getState().conversations.find((c) => c.id === conversationId);
  return `${conversationId}:${(conv?.messages.length ?? 0) + offset}`;
};

function startSession(replyId: string, profile: VoiceProfile | null): Session | null {
  if (!profile) {
    const begun = beginSpeechStream('stream');
    if (!begun) return null;
    const s: Session = { key: begun.key, replyId, sent: 0, lastAnswer: '', chain: Promise.resolve(), usable: true };
    // The saved voice first (an agent's voice may have been loaded before), then the stream starts.
    s.chain = restoreSavedVoice().catch(() => undefined).then(() => begun.started).then((ok) => { s.usable = ok; });
    return s;
  }
  // The agent's own voice must be ready before anything is spoken, so the stream begins only after it loads.
  const s: Session = { key: '', replyId, sent: 0, lastAnswer: '', chain: Promise.resolve(), usable: true };
  const stopsBefore = stopsSoFar();
  s.chain = loadVoiceForSpeech(profile.voiceId, profile.sid, { referenceId: profile.referenceId, steps: profile.steps })
    .then(() => {
      if (stopsSoFar() !== stopsBefore) { s.silenced = true; s.usable = false; return undefined; } // stopped (barge-in) while the voice loaded
      const begun = beginSpeechStream('stream', profile.rate);
      if (!begun) { s.usable = false; return undefined; }
      s.key = begun.key;
      return begun.started.then((ok) => { s.usable = ok; });
    })
    .catch(() => { s.usable = false; }); // the voice could not be loaded: the whole reply is spoken the old way
  return s;
}

/** Called with the whole answer written so far, on every token while a reply streams. */
export function onStreamToken(answer: string): void {
  if (!ttsAvailable() || useUiModeStore.getState().interfaceMode !== 'audio') return;
  const conversationId = useChatStore.getState().streamingForConversationId;
  if (!conversationId) return;
  const replyId = replyIdFor(conversationId);
  if (replyId === dropped) return;
  if (session && session.replyId !== replyId) session = null; // an earlier reply that never reported its end
  if (!session) {
    if (!answer.trim()) return;
    session = startSession(replyId, profileForConversation(conversationId));
    if (!session) { dropped = replyId; return; }
  }
  const s = session;
  // Someone stopped the voice (a tap, talking over it, other speech): this reply is not spoken any more.
  if (s.key && useAtlasVoiceStore.getState().speakingKey !== s.key) { dropped = replyId; session = null; return; }
  s.lastAnswer = answer;
  if (answer.length < s.sent) s.sent = 0; // a new round of the reply started after a tool call
  const cut = sentenceEnd(answer, s.sent);
  if (cut <= s.sent) return;
  const text = prepareMessageForSpeech(answer.slice(s.sent, cut));
  s.sent = cut;
  if (text.trim()) s.chain = s.chain.then(() => { if (s.usable) appendSpeechStream(text); });
}

/**
 * The reply has finished writing. Returns true when this took care of speaking it (including when it
 * must stay silent because it was interrupted); false when the caller should speak the whole reply.
 */
export function finishStreamSpeech(conversationId: string, speakWhole: () => void): boolean {
  if (dropped !== null && dropped === replyIdFor(conversationId, -1)) { dropped = null; return true; }
  const s = session;
  session = null;
  if (!s) return false;
  if (s.key && useAtlasVoiceStore.getState().speakingKey !== s.key) return true; // interrupted at the very end
  const tail = prepareMessageForSpeech(s.lastAnswer.slice(s.sent));
  s.chain = s.chain.then(() => {
    if (s.silenced) return;
    if (!s.usable) { speakWhole(); return; } // the voice could not take streamed text
    if (tail.trim()) appendSpeechStream(tail);
    endSpeechStream();
  });
  return true;
}

/** For tests: forget any reply in progress. @public */
export function resetStreamSpeech(): void { session = null; dropped = null; }
