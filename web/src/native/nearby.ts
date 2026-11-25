// AtlasNearbySync for the Windows app: encrypted offline sync with phones and other PCs on the same network.
// The transport is in the shell's main process (desktop/lib/nearby.cjs, the Android app's wire protocol); the sync logic
// itself (what is exchanged and merged) is the app's own src/services/nearbySync. Browsers cannot open server sockets,
// so the browser build does not register this module and the app hides the setting.
import { bus, registerNativeModule } from './registry';

interface NearbyHost {
  start(): Promise<unknown>; stop(): Promise<boolean>; invitation(): Promise<string>;
  pair(uri: string, payload: string): Promise<unknown>; sync(id: string, payload: string): Promise<unknown>;
  respond(requestId: string, payload: string): Promise<boolean>; peers(): Promise<unknown[]>; unpair(id: string): Promise<boolean>;
  onMessage(cb: (m: unknown) => void): void;
}
const host = (): NearbyHost | undefined => (globalThis as any).atlasHost?.nearby;

if (host()) {
  const h = host()!;
  h.onMessage((m) => bus.emit('AtlasNearbyMessage', m));
  registerNativeModule('AtlasNearbySync', {
    addListener() {}, removeListeners() {},
    start: () => h.start(), stop: () => h.stop(), invitation: () => h.invitation(),
    pair: (uri: string, payload: string) => h.pair(uri, payload), sync: (id: string, payload: string) => h.sync(id, payload),
    respond: (requestId: string, payload: string) => h.respond(requestId, payload), peers: () => h.peers(), unpair: (id: string) => h.unpair(id),
  });
}
