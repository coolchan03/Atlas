// The web stand-in for React Native's NativeModules. Web implementations of the app's native modules
// register themselves here (see ./index.ts). A module that is not registered is absent, exactly like
// an Android-only module on iOS: the app's own `if (!NativeModules.X)` checks then turn the feature off.
type Listener = (payload: any) => void;

export class WebEmitter {
  private listeners = new Map<string, Set<Listener>>();
  addListener(event: string, cb: Listener) {
    let set = this.listeners.get(event);
    if (!set) this.listeners.set(event, (set = new Set()));
    set.add(cb);
    return { remove: () => set!.delete(cb) };
  }
  removeAllListeners(event?: string) {
    if (event) this.listeners.delete(event);
    else this.listeners.clear();
  }
  emit(event: string, payload?: any) {
    this.listeners.get(event)?.forEach((cb) => {
      try {
        cb(payload);
      } catch (e) {
        console.error('[native-event]', event, e);
      }
    });
  }
}

/** One shared bus: every web native module emits through it, and any NativeEventEmitter hears it. */
export const bus = new WebEmitter();

export const NativeModules: Record<string, any> = {};

export function registerNativeModule(name: string, impl: Record<string, any>) {
  NativeModules[name] = impl;
}

/** Same surface as React Native's NativeEventEmitter. The module argument is ignored: one bus. */
export class NativeEventEmitter {
  constructor(_module?: unknown) {}
  addListener(event: string, cb: Listener) {
    return bus.addListener(event, cb);
  }
  removeAllListeners(event: string) {
    bus.removeAllListeners(event);
  }
  removeSubscription(sub: { remove: () => void }) {
    sub.remove();
  }
  emit(event: string, payload?: any) {
    bus.emit(event, payload);
  }
  listenerCount(event: string) {
    return (bus as any).listeners.get(event)?.size ?? 0;
  }
}
