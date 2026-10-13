import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, NativeModules, Platform } from 'react-native';
import type { Project } from '../types';

/** Selective encryption of project metadata only. The knowledge-base importer
 * refuses additions to protected projects until RAG document vaulting exists.
 * Protecting projects with existing documents, chats or study outputs is
 * intentionally rejected; otherwise the UI would promise false security. */
const KEY = 'local-llm-project-storage';
const pins = new Map<string, string>();
const blobs = new Map<string, string>();
const lastEncrypted = new Map<string, string>();
let pending: Promise<void> = Promise.resolve();
const queue = (job: () => Promise<void>): Promise<void> => {
  const current = pending.then(job);
  pending = current.catch(() => undefined);
  return current;
};
const native = () => {
  const mod = NativeModules.AtlasDevice;
  if (Platform.OS !== 'android' || !mod?.encryptProtectedItem || !mod?.decryptProtectedItem)
    throw new Error('Updated Android Atlas encryption is required.');
  return mod as {
    createChatPinVerifier(pin: string): Promise<string>;
    encryptProtectedItem(kind: string, id: string, plain: string, pin: string, verifier: string): Promise<string>;
    decryptProtectedItem(kind: string, id: string, blob: string, pin: string, verifier: string): Promise<string>;
    removeProtectedItemKey(kind: string, id: string, pin: string, verifier: string): Promise<boolean>;
  };
};
const clearSecurity = (p: Project): Project => {
  const { pinVerifier, protectedBlob, ...rest } = p;
  return rest as Project;
};
const stub = (p: Project, blob: string): Project => ({
  id: p.id, name: 'Locked project', description: '',
  systemPrompt: '', createdAt: p.createdAt, updatedAt: p.updatedAt,
  pinVerifier: p.pinVerifier, protectedBlob: blob,
});
const seal = async (raw: string): Promise<string> => {
  const root = JSON.parse(raw);
  if (!Array.isArray(root?.state?.projects)) throw new Error('Invalid project persistence data.');
  const projects: Project[] = [];
  for (const p of root.state.projects as Project[]) {
    if (!p.pinVerifier) { projects.push(clearSecurity(p)); continue; }
    let blob = blobs.get(p.id) || p.protectedBlob;
    const pin = pins.get(p.id);
    const plain = JSON.stringify(clearSecurity(p));
    if (pin && (!blob || lastEncrypted.get(p.id) !== plain)) {
      blob = await native().encryptProtectedItem('project', p.id, plain, pin, p.pinVerifier);
      blobs.set(p.id, blob); lastEncrypted.set(p.id, plain);
    }
    if (!blob) throw new Error('Project is PIN-marked but not encrypted. Refusing plaintext persistence.');
    projects.push(stub(p, blob));
  }
  root.state.projects = projects;
  return JSON.stringify(root);
};
async function writeReplacement(id: string, project: Project): Promise<void> {
  return queue(async () => {
    const text = await AsyncStorage.getItem(KEY);
    if (!text) throw new Error('Project is not saved yet. Retry when saving finishes.');
    const root = JSON.parse(text);
    const index = root.state.projects.findIndex((p: Project) => p.id === id);
    if (index < 0) throw new Error('Project was not found in saved data.');
    root.state.projects[index] = project;
    const protectedText = await seal(JSON.stringify(root));
    await AsyncStorage.setItem(KEY, protectedText);
    if (await AsyncStorage.getItem(KEY) !== protectedText) throw new Error('Could not verify protected project write.');
  });
}
export function isProtectedProjectUnlocked(id: string): boolean {
  return pins.has(id);
}
export async function protectProject(id: string, pin: string): Promise<void> {
  const { useProjectStore } = require('./projectStore');
  const { useChatStore } = require('./chatStore');
  const { useStudyStore } = require('../study/engine');
  const { ragService } = require('../services/rag');
  await pending;
  const project: Project | undefined = useProjectStore.getState().projects.find((p: Project) => p.id === id);
  if (!project || project.pinVerifier) throw new Error('Choose an existing unprotected project.');
  if (useChatStore.getState().conversations.some((c: any) => c.projectId === id) ||
      (useStudyStore.getState().saved[id] || []).length) {
    throw new Error('Move or remove associated chats and study outputs first. They are not yet part of the protected project vault.');
  }
  const docs = await ragService.getDocumentsByProject(id);
  if (docs.length) throw new Error('Knowledge-base documents cannot yet be encrypted safely. Remove them before protecting this project.');
  const api = native();
  const verifier = await api.createChatPinVerifier(pin);
  const plain = JSON.stringify(clearSecurity(project));
  const blob = await api.encryptProtectedItem('project', id, plain, pin, verifier);
  if (await api.decryptProtectedItem('project', id, blob, pin, verifier) !== plain) throw new Error('Project encryption verification failed.');
  const locked = stub({ ...project, pinVerifier: verifier }, blob);
  await writeReplacement(id, locked);
  blobs.set(id, blob); pins.delete(id); lastEncrypted.delete(id);
  useProjectStore.setState((s: any) => ({ projects: s.projects.map((p: Project) => p.id === id ? locked : p) }));
}
async function decryptProject(p: Project, pin: string): Promise<Project> {
  if (!p.pinVerifier || !p.protectedBlob) throw new Error('Project is not protected.');
  const blob = blobs.get(p.id) || p.protectedBlob;
  const text = await native().decryptProtectedItem('project', p.id, blob, pin, p.pinVerifier);
  const decrypted = JSON.parse(text) as Project;
  if (decrypted.id !== p.id || typeof decrypted.systemPrompt !== 'string') throw new Error('Protected project data is invalid.');
  return decrypted;
}
export async function unlockProject(id: string, pin: string): Promise<void> {
  await pending;
  const { useProjectStore } = require('./projectStore');
  const p: Project | undefined = useProjectStore.getState().projects.find((x: Project) => x.id === id);
  if (!p) throw new Error('Project not found.');
  const original = await decryptProject(p, pin);
  pins.set(id, pin); lastEncrypted.set(id, JSON.stringify(clearSecurity(original)));
  useProjectStore.setState((s: any) => ({ projects: s.projects.map((x: Project) => x.id === id
    ? { ...original, pinVerifier: p.pinVerifier, protectedBlob: p.protectedBlob } : x) }));
}
export async function permanentlyUnprotectProject(id: string, pin: string): Promise<void> {
  await pending;
  const { useProjectStore } = require('./projectStore');
  const p: Project | undefined = useProjectStore.getState().projects.find((x: Project) => x.id === id);
  if (!p || !p.pinVerifier) throw new Error('Project is not protected.');
  const decrypted = await decryptProject(p, pin);
  await writeReplacement(id, clearSecurity(decrypted));
  pins.delete(id); blobs.delete(id); lastEncrypted.delete(id);
  useProjectStore.setState((s: any) => ({ projects: s.projects.map((x: Project) => x.id === id ? decrypted : x) }));
  await native().removeProtectedItemKey('project', id, pin, p.pinVerifier);
}
export async function relockProjects(): Promise<void> {
  await pending;
  const { useProjectStore } = require('./projectStore');
  const projects = useProjectStore.getState().projects;
  await protectedProjectStorage.setItem(KEY, JSON.stringify({ state: { projects }, version: 0 }));
  pins.clear(); lastEncrypted.clear();
  useProjectStore.setState((s: any) => ({ projects: s.projects.map((p: Project) => p.pinVerifier
    ? stub(p, blobs.get(p.id) || p.protectedBlob || '') : p) }));
}
if (Platform.OS === 'android') AppState.addEventListener('change', state => {
  if (state !== 'active') void relockProjects().catch(() => undefined);
});
export const protectedProjectStorage = {
  async getItem(key: string): Promise<string | null> {
    if (key !== KEY) throw new Error('Unexpected project storage key.');
    await pending;
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const safe = await seal(raw);
    if (safe !== raw) await AsyncStorage.setItem(KEY, safe);
    const parsed = JSON.parse(safe);
    parsed.state.projects.forEach((p: Project) => { if (p.protectedBlob) blobs.set(p.id, p.protectedBlob); });
    return safe;
  },
  async setItem(key: string, value: string): Promise<void> {
    if (key !== KEY) throw new Error('Unexpected project storage key.');
    return queue(async () => {
      const safe = await seal(value);
      if (await AsyncStorage.getItem(KEY) !== safe) await AsyncStorage.setItem(KEY, safe);
    });
  },
  async removeItem(key: string): Promise<void> {
    if (key !== KEY) throw new Error('Unexpected project storage key.');
    return queue(async () => {
      await AsyncStorage.removeItem(KEY);
      pins.clear(); blobs.clear(); lastEncrypted.clear();
    });
  },
};
