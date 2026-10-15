import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, NativeEventEmitter, NativeModules, Platform } from 'react-native';
import { useProjectStore } from '../../stores/projectStore';
import { useChatStore } from '../../stores/chatStore';
import { useAgentStore } from '../../stores/agentStore';
import { useAuthStore } from '../../stores/authStore';
import { collectProjectFiles, restoreProjectFiles } from '../../atlasTools/projectBackupFiles';
import { mergeAgents, mergeConversations, mergeProjects, validateSnapshot } from './merge';
import type { SyncSnapshot } from './merge';

const PREF = 'atlas-sync-enabled-v1';
type NativeReply = { peerId: string; payload: string; transport: 'wifi' | 'bluetooth' };
type Peer = { id: string; address: string };
type NativeNearby = {
  start(): Promise<{ deviceId: string; address: string; port: number }>;
  stop(): Promise<boolean>;
  invitation(): Promise<string>;
  pair(uri: string, payload: string): Promise<NativeReply>;
  sync(id: string, payload: string): Promise<NativeReply>;
  respond(requestId: string, payload: string): Promise<boolean>;
  peers(): Promise<Peer[]>;
  unpair(id: string): Promise<boolean>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
};
export interface NearbyStatus {
  enabled: boolean;
  deviceId: string;
  peers: Peer[];
  lastSync?: string;
  lastError?: string;
  syncing: boolean;
}
type Incoming = { requestId: string; peerId: string; payload: string; newPair: boolean };
export const nearbyAvailable = Platform.OS === 'android' && Boolean(NativeModules.AtlasNearbySync);
const native = (): NativeNearby => {
  if (!nearbyAvailable) throw new Error('Offline peer sync needs the updated Android build.');
  return NativeModules.AtlasNearbySync as NativeNearby;
};
class NearbySyncService {
  private deviceId = '';
  private enabled = false;
  private active = AppState.currentState !== 'background' && AppState.currentState !== 'inactive';
  private running = false;
  private polling: ReturnType<typeof setInterval> | null = null;
  private listener: { remove(): void } | null = null;
  private appListener: { remove(): void } | null = null;
  private busy = false;
  private mergeQueue: Promise<void> = Promise.resolve();
  private listeners = new Set<(s: NearbyStatus) => void>();
  private status: NearbyStatus = { enabled: false, deviceId: '', peers: [], syncing: false };
  getStatus() { return this.status; }
  subscribe(fn: (s: NearbyStatus) => void) { this.listeners.add(fn); fn(this.status); return () => { this.listeners.delete(fn); }; }
  private publish(patch: Partial<NearbyStatus>) {
    this.status = { ...this.status, ...patch };
    for (const fn of this.listeners) fn(this.status);
  }
  private isLocked() {
    const state = useAuthStore.getState();
    return state.isEnabled && state.isLocked;
  }
  private async hydrated() {
    const stores = [useProjectStore, useChatStore, useAgentStore] as const;
    for (const store of stores) {
      if (store.persist?.hasHydrated?.() === false) await store.persist.rehydrate();
    }
  }
  private async snapshot(): Promise<SyncSnapshot> {
    await this.hydrated();
    const projects = useProjectStore.getState().projects
      .filter(p => !p.pinVerifier && !p.protectedBlob);
    const allowed = new Set(projects.map(p => p.id));
    const conversations = useChatStore.getState().conversations
      .filter(c => !c.isPrivate && !c.pinVerifier && !c.protectedBlob &&
        (!c.projectId || allowed.has(c.projectId)))
      .map(c => ({ ...c, messages: c.messages.map(m => ({ ...m, audioPath: undefined })) }));
    const agents = useAgentStore.getState().agents;
    const files = await collectProjectFiles(projects.map(p => p.id));
    return {
      version: 1, sourceId: this.deviceId, projects, conversations, agents, files,
    };
  }
  private async apply(json: string, expectedPeerId: string): Promise<void> {
    const pending = this.mergeQueue.then(() => this.applyOne(json, expectedPeerId));
    this.mergeQueue = pending.catch(() => undefined);
    return pending;
  }
  private async applyOne(json: string, expectedPeerId: string): Promise<void> {
    const remote = validateSnapshot(JSON.parse(json));
    if (remote.sourceId !== expectedPeerId || remote.sourceId === this.deviceId)
      throw new Error('Wrong device identity in encrypted sync message');
    await this.hydrated();
    const projects = useProjectStore.getState().projects;
    const nextProjects = mergeProjects(projects, remote.projects);
    const allowed = new Set(nextProjects.items.filter(p => !p.pinVerifier && !p.protectedBlob)
      .map(p => p.id));
    const conversations = useChatStore.getState().conversations;
    const filtered = remote.conversations.filter(c => !c.projectId || allowed.has(c.projectId));
    const nextChats = mergeConversations(conversations, filtered);
    const nextAgents = mergeAgents(useAgentStore.getState().agents, remote.agents);
    const files = (remote.files ?? []).filter(file => allowed.has(file.projectId));
    if (files.length) await restoreProjectFiles(files, [...allowed], true);
    useProjectStore.setState({ projects: nextProjects.items });
    useChatStore.setState({ conversations: nextChats.items });
    useAgentStore.setState({ agents: nextAgents.items });
    this.publish({ lastSync: new Date().toISOString(), lastError: undefined });
  }
  private async incoming(message: Incoming) {
    try {
      if (!this.enabled || !this.active || this.isLocked()) throw new Error('Offline sync is paused while Atlas is locked');
      if (this.busy) throw new Error('Another synchronization is in progress');
      this.busy = true;
      this.publish({ syncing: true });
      await this.apply(message.payload, message.peerId);
      await native().respond(message.requestId, JSON.stringify(await this.snapshot()));
      await this.refreshPeers();
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      this.publish({ lastError: reason });
      await native().respond(message.requestId, JSON.stringify({ error: reason })).catch(() => undefined);
    } finally {
      this.busy = false;
      this.publish({ syncing: false });
    }
  }
  async init() {
    if (!nearbyAvailable || this.appListener) return;
    this.appListener = AppState.addEventListener('change', state => {
      this.active = state === 'active';
      if (!this.active) { this.stopRuntime().catch(() => undefined); return; }
      if (this.enabled) this.run().catch(e => this.publish({ lastError: String(e) }));
    });
    this.enabled = await AsyncStorage.getItem(PREF) === 'true';
    this.publish({ enabled: this.enabled });
    if (this.enabled && this.active) await this.run();
  }
  private async run() {
    if (this.running || !this.active || !this.enabled) return;
    const info = await native().start();
    this.deviceId = info.deviceId;
    this.running = true;
    this.publish({ deviceId: info.deviceId });
    this.listener = new NativeEventEmitter(NativeModules.AtlasNearbySync)
      .addListener('AtlasNearbyMessage', (event: Incoming) => { this.incoming(event); });
    await this.refreshPeers();
    this.polling = setInterval(() => { this.syncAll().catch(() => undefined); }, 60000);
    this.syncAll().catch(() => undefined);
  }
  private async stopRuntime() {
    if (this.polling) { clearInterval(this.polling); this.polling = null; }
    this.listener?.remove(); this.listener = null;
    this.running = false;
    if (nearbyAvailable) await native().stop();
  }
  async setEnabled(enabled: boolean) {
    if (!nearbyAvailable) throw new Error('Offline sync requires Android.');
    this.enabled = enabled;
    await AsyncStorage.setItem(PREF, enabled ? 'true' : 'false');
    this.publish({ enabled, lastError: undefined });
    if (enabled && this.active) await this.run();
    if (!enabled) await this.stopRuntime();
  }
  async refreshPeers(): Promise<Peer[]> {
    const peers = await native().peers();
    this.publish({ peers });
    return peers;
  }
  async createInvitation() {
    if (!this.enabled) await this.setEnabled(true);
    if (!this.running) await this.run();
    return native().invitation();
  }
  async joinInvitation(uri: string) {
    if (!this.enabled) await this.setEnabled(true);
    if (!this.running) await this.run();
    if (this.busy) throw new Error('A sync is already running');
    this.busy = true; this.publish({ syncing: true });
    try {
      const response = await native().pair(uri, JSON.stringify(await this.snapshot()));
      if (response.payload.startsWith('{"error":')) throw new Error(JSON.parse(response.payload).error);
      await this.apply(response.payload, response.peerId);
      await this.refreshPeers();
    } finally { this.busy = false; this.publish({ syncing: false }); }
  }
  async syncPeer(peerId: string) {
    if (!this.enabled || !this.active || this.busy || this.isLocked()) return;
    this.busy = true; this.publish({ syncing: true });
    try {
      const response = await native().sync(peerId, JSON.stringify(await this.snapshot()));
      if (response.payload.startsWith('{"error":')) throw new Error(JSON.parse(response.payload).error);
      await this.apply(response.payload, response.peerId);
    } catch (e) {
      this.publish({ lastError: String(e) });
      throw e;
    } finally { this.busy = false; this.publish({ syncing: false }); }
  }
  async syncAll() {
    if (!this.running || this.busy || !this.active || this.isLocked()) return;
    const peers = await this.refreshPeers();
    for (const peer of peers) {
      try { await this.syncPeer(peer.id); } catch { /* Retry when both devices reconnect. */ }
    }
  }
  async unpair(id: string) {
    await native().unpair(id);
    await this.refreshPeers();
  }
}
export const nearbySync = new NearbySyncService();
