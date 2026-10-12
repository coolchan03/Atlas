import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, NativeModules, Platform } from 'react-native';
import type { Conversation } from '../types';

// Ordinary chats are stored normally. Only individually PIN-protected chats
// are persisted as encrypted, title-less placeholders.
const KEY = 'local-llm-chat-storage';
const OLD_KEY = 'atlas-chat-encrypted-v1';
const sessionPins = new Map<string, string>();
const latestBlobs = new Map<string, string>();
const lastSealed = new Map<string, string>();
let writes: Promise<void> = Promise.resolve();
const queue = (fn: () => Promise<void>) => {
  const next = writes.then(fn);
  writes = next.catch(() => undefined);
  return next;
};
const native = () => {
  const mod = NativeModules.AtlasDevice;
  if (Platform.OS !== 'android' || !mod) throw new Error('An updated Android Keystore bridge is required.');
  return mod as {
    encryptChatState(value: string): Promise<string>;
    decryptChatState(value: string): Promise<string>;
    createChatPinVerifier(pin: string): Promise<string>;
    verifyChatPin(pin: string, verifier: string): Promise<boolean>;
    encryptProtectedItem(kind: string, id: string, plain: string, pin: string, verifier: string): Promise<string>;
    decryptProtectedItem(kind: string, id: string, blob: string, pin: string, verifier: string): Promise<string>;
    removeProtectedItemKey(kind: string, id: string, pin: string, verifier: string): Promise<boolean>;
  };
};
const publicBody = (conv: Conversation): Conversation => {
  const { pinVerifier, protectedBlob, ...rest } = conv;
  return rest as Conversation;
};
const placeholder = (conv: Conversation, blob: string): Conversation => ({
  id: conv.id,
  title: 'Locked conversation',
  modelId: conv.modelId,
  createdAt: conv.createdAt,
  updatedAt: conv.updatedAt,
  projectId: conv.projectId,
  agentId: conv.agentId,
  isArchived: conv.isArchived,
  messages: [],
  pinVerifier: conv.pinVerifier,
  protectedBlob: blob,
});
async function sealedState(text: string): Promise<string> {
  const root = JSON.parse(text);
  if (!Array.isArray(root?.state?.conversations)) throw new Error('Invalid saved chat state.');
  const out: Conversation[] = [];
  for (const conv of root.state.conversations as Conversation[]) {
    if (!conv.pinVerifier) {
      out.push(publicBody(conv));
      continue;
    }
    let blob = latestBlobs.get(conv.id) || conv.protectedBlob;
    const pin = sessionPins.get(conv.id);
    const plain = JSON.stringify(publicBody(conv));
    if (pin && (!blob?.startsWith('atlasitem:v1:') || lastSealed.get(conv.id) !== plain)) {
      blob = await native().encryptProtectedItem('chat', conv.id, plain, pin, conv.pinVerifier);
      latestBlobs.set(conv.id, blob);
      lastSealed.set(conv.id, plain);
    }
    if (!blob) {
      // Old UI-only PIN records, encountered during migration, stay encrypted
      // with the existing installation key until the user unlocks and upgrades.
      blob = await native().encryptChatState(plain);
      latestBlobs.set(conv.id, blob);
    }
    out.push(placeholder(conv, blob));
  }
  root.state.conversations = out;
  return JSON.stringify(root);
}
async function saveReplacement(id: string, next: Conversation): Promise<void> {
  return queue(async () => {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) throw new Error('Chat is not yet saved; retry after it finishes saving.');
    const root = JSON.parse(raw);
    const index = root.state.conversations.findIndex((c: Conversation) => c.id === id);
    if (index < 0) throw new Error('Protected chat is missing from saved data.');
    root.state.conversations[index] = next;
    const sealed = await sealedState(JSON.stringify(root));
    await AsyncStorage.setItem(KEY, sealed);
    if (await AsyncStorage.getItem(KEY) !== sealed) throw new Error('Could not verify chat protection update.');
  });
}
export async function protectChat(id: string, pin: string): Promise<void> {
  const { useChatStore } = require('./chatStore');
  await writes;
  const conv: Conversation | undefined = useChatStore.getState().conversations.find((c: Conversation) => c.id === id);
  if (!conv || conv.isPrivate || conv.pinVerifier) throw new Error('Select an unlocked, saved conversation.');
  const api = native();
  const verifier = await api.createChatPinVerifier(pin);
  const plain = JSON.stringify(publicBody(conv));
  const blob = await api.encryptProtectedItem('chat', id, plain, pin, verifier);
  if (await api.decryptProtectedItem('chat', id, blob, pin, verifier) !== plain) throw new Error('Encryption verification failed.');
  const stub = placeholder({ ...conv, pinVerifier: verifier }, blob);
  await saveReplacement(id, stub);  // seal on disk before hiding the plaintext in memory
  latestBlobs.set(id, blob);
  sessionPins.delete(id); lastSealed.delete(id);
  useChatStore.setState((s: any) => ({ conversations: s.conversations.map((c: Conversation) => c.id === id ? stub : c) }));
}
async function recover(conv: Conversation, pin: string): Promise<{ restored: Conversation; blob: string }> {
  const api = native();
  if (!conv.pinVerifier || !conv.protectedBlob) throw new Error('This chat has no protected record.');
  let blob = latestBlobs.get(conv.id) || conv.protectedBlob;
  let clear: string;
  if (blob.startsWith('atlasenc:v1:')) {
    if (!await api.verifyChatPin(pin, conv.pinVerifier)) throw new Error('Incorrect PIN.');
    clear = await api.decryptChatState(blob);
    // Upgrade old installation-wide PIN ciphertext when authenticated.
    const upgraded = await api.encryptProtectedItem('chat', conv.id, clear, pin, conv.pinVerifier);
    await saveReplacement(conv.id, placeholder(conv, upgraded));
    blob = upgraded;
  } else clear = await api.decryptProtectedItem('chat', conv.id, blob, pin, conv.pinVerifier);
  const restored = JSON.parse(clear) as Conversation;
  if (restored.id !== conv.id || !Array.isArray(restored.messages)) throw new Error('Damaged protected chat.');
  latestBlobs.set(conv.id, blob);
  return { restored, blob };
}
export async function unlockChat(id: string, pin: string): Promise<void> {
  const { useChatStore } = require('./chatStore');
  await writes;
  const conv: Conversation | undefined = useChatStore.getState().conversations.find((c: Conversation) => c.id === id);
  if (!conv) throw new Error('Conversation not found.');
  const { restored, blob } = await recover(conv, pin);
  sessionPins.set(id, pin);
  lastSealed.set(id, JSON.stringify(publicBody(restored)));
  useChatStore.setState((s: any) => ({ conversations: s.conversations.map((c: Conversation) => c.id === id
    ? { ...restored, projectId: c.projectId, isArchived: c.isArchived, pinVerifier: conv.pinVerifier, protectedBlob: blob } : c) }));
}
export async function permanentlyUnprotectChat(id: string, pin: string): Promise<void> {
  const { useChatStore } = require('./chatStore');
  await writes;
  const conv: Conversation | undefined = useChatStore.getState().conversations.find((c: Conversation) => c.id === id);
  if (!conv) throw new Error('Conversation not found.');
  const { restored, blob } = await recover(conv, pin);
  const open = { ...publicBody(restored), projectId: conv.projectId, isArchived: conv.isArchived };
  await saveReplacement(id, open); // verify readable saved copy BEFORE revoking the key
  sessionPins.delete(id); latestBlobs.delete(id); lastSealed.delete(id);
  useChatStore.setState((s: any) => ({ conversations: s.conversations.map((c: Conversation) => c.id === id ? open : c) }));
  if (blob.startsWith('atlasitem:v1:')) await native().removeProtectedItemKey('chat', id, pin, conv.pinVerifier!);
}
export async function relockProtectedChats(): Promise<void> {
  await writes;
  const { useChatStore } = require('./chatStore');
  const state = useChatStore.getState();
  // Flush any just-generated messages while the PIN is still in memory.
  // Clearing the credential before that write could discard the last reply.
  await encryptedChatStorage.setItem(KEY, JSON.stringify({
    state: { conversations: state.conversations.filter((c: Conversation) => !c.isPrivate), activeConversationId: state.activeConversationId }, version: 0,
  }));
  sessionPins.clear();
  lastSealed.clear();
  useChatStore.setState((s: any) => ({ conversations: s.conversations.map((c: Conversation) => c.pinVerifier
    ? placeholder(c, latestBlobs.get(c.id) || c.protectedBlob || '') : c) }));
}
if (Platform.OS === 'android') AppState.addEventListener('change', state => {
  if (state !== 'active') void relockProtectedChats().catch(() => undefined);
});
export const encryptedChatStorage = {
  async getItem(key: string): Promise<string | null> {
    if (key !== KEY) throw new Error('Unexpected chat key.');
    await writes;
    let raw = await AsyncStorage.getItem(KEY);
    if (!raw) {
      const old = await AsyncStorage.getItem(OLD_KEY);
      if (!old) return null;
      const clear = await native().decryptChatState(old);
      raw = await sealedState(clear);
      await AsyncStorage.setItem(KEY, raw);
      if (await AsyncStorage.getItem(KEY) !== raw) throw new Error('Chat migration verification failed.');
      await AsyncStorage.removeItem(OLD_KEY);
    } else {
      const safe = await sealedState(raw);
      if (safe !== raw) { await AsyncStorage.setItem(KEY, safe); raw = safe; }
      // Finish interrupted migration once the selective copy is verified.
      if (await AsyncStorage.getItem(OLD_KEY)) {
        if (await AsyncStorage.getItem(KEY) !== raw) throw new Error('Chat migration verification failed.');
        await AsyncStorage.removeItem(OLD_KEY);
      }
    }
    const parsed = JSON.parse(raw);
    (parsed.state.conversations as Conversation[]).forEach(c => { if (c.protectedBlob) latestBlobs.set(c.id, c.protectedBlob); });
    return raw;
  },
  async setItem(key: string, value: string): Promise<void> {
    if (key !== KEY) throw new Error('Unexpected chat key.');
    return queue(async () => {
      const sealed = await sealedState(value);
      if (await AsyncStorage.getItem(KEY) !== sealed) await AsyncStorage.setItem(KEY, sealed);
    });
  },
  async removeItem(key: string): Promise<void> {
    if (key !== KEY) throw new Error('Unexpected chat key.');
    return queue(async () => {
      await AsyncStorage.multiRemove([KEY, OLD_KEY]);
      sessionPins.clear(); latestBlobs.clear(); lastSealed.clear();
    });
  },
};
