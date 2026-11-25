// The `react-native` module as the app's own code sees it on the web: react-native-web, plus the pieces
// react-native-web leaves out or stubs (Alert, NativeModules, PermissionsAndroid, ToastAndroid,
// ActionSheetIOS, requireNativeComponent). Platform.OS reports 'android' because Atlas is Android-first:
// its native-module paths (battery, storage, location, TTS ...) are the ones the web modules implement.
import * as RNW from 'react-native-web';
import { NativeModules, NativeEventEmitter, bus } from '../native/registry';
import { showDialog, showToast } from './dialog';
import { AtlasMapView } from '../map/MapView';

export * from 'react-native-web';
export { NativeModules, NativeEventEmitter };
export { Image, ImageBackground } from './Image';

const baseSelect = (RNW.Platform as any).select;
export const Platform = {
  OS: 'android' as const,
  Version: 34,
  isTV: false,
  isTesting: false,
  constants: { Release: '14', Brand: 'web', Model: 'browser' },
  select<T>(spec: { android?: T; native?: T; default?: T; web?: T; ios?: T }): T | undefined {
    return (spec.android ?? spec.native ?? spec.default) as T | undefined;
  },
  __rnwSelect: baseSelect,
};

export const DeviceEventEmitter = {
  addListener: (e: string, cb: (p: any) => void) => bus.addListener(e, cb),
  removeAllListeners: (e?: string) => bus.removeAllListeners(e),
  emit: (e: string, p?: any) => bus.emit(e, p),
};

type AlertButton = { text?: string; style?: 'default' | 'cancel' | 'destructive'; onPress?: (v?: string) => void };
export const Alert = {
  alert(title: string, message?: string, buttons?: AlertButton[], options?: { cancelable?: boolean; onDismiss?: () => void }) {
    showDialog(title, message, buttons ?? [{ text: 'OK' }], { cancelable: options?.cancelable, onDismiss: options?.onDismiss });
  },
  prompt(title: string, message?: string, callbackOrButtons?: any, _type?: string, defaultValue?: string) {
    const buttons: AlertButton[] =
      typeof callbackOrButtons === 'function'
        ? [{ text: 'Cancel', style: 'cancel' }, { text: 'OK', onPress: callbackOrButtons }]
        : callbackOrButtons ?? [{ text: 'OK' }];
    showDialog(title, message, buttons, { input: { defaultValue, secure: _type === 'secure-text' }, cancelable: true });
  },
};

export const ToastAndroid = {
  SHORT: 2000,
  LONG: 3500,
  TOP: 1,
  BOTTOM: 2,
  CENTER: 3,
  show: (message: string, duration?: number) => showToast(message, duration ?? 2000),
  showWithGravity: (message: string, duration?: number) => showToast(message, duration ?? 2000),
  showWithGravityAndOffset: (message: string, duration?: number) => showToast(message, duration ?? 2000),
};

export const ActionSheetIOS = {
  showActionSheetWithOptions(
    opts: { options: string[]; cancelButtonIndex?: number; destructiveButtonIndex?: number; title?: string; message?: string },
    cb: (i: number) => void,
  ) {
    showDialog(
      opts.title ?? '',
      opts.message,
      opts.options.map((text, i) => ({
        text,
        style: i === opts.cancelButtonIndex ? 'cancel' : i === opts.destructiveButtonIndex ? 'destructive' : 'default',
        onPress: () => cb(i),
      })),
      { cancelable: true, onDismiss: () => opts.cancelButtonIndex != null && cb(opts.cancelButtonIndex) },
    );
  },
};

// Android runtime permissions map onto the browser's own prompts. A browser asks when the feature is
// first used, so request() performs the matching probe where there is one and otherwise grants.
const GRANTED = 'granted';
const DENIED = 'denied';
const NEVER = 'never_ask_again';
async function requestPermission(permission: string): Promise<string> {
  try {
    if (/RECORD_AUDIO/.test(permission) && navigator.mediaDevices?.getUserMedia) {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
      return GRANTED;
    }
    if (/CAMERA/.test(permission) && navigator.mediaDevices?.getUserMedia) {
      const s = await navigator.mediaDevices.getUserMedia({ video: true });
      s.getTracks().forEach((t) => t.stop());
      return GRANTED;
    }
    if (/LOCATION/.test(permission) && navigator.geolocation) {
      return await new Promise<string>((res) =>
        navigator.geolocation.getCurrentPosition(
          () => res(GRANTED),
          (e) => res(e.code === 1 ? NEVER : DENIED),
          { timeout: 15000 },
        ),
      );
    }
    if (/NOTIFICATION/.test(permission) && 'Notification' in window) {
      const r = await Notification.requestPermission();
      return r === 'granted' ? GRANTED : r === 'denied' ? NEVER : DENIED;
    }
  } catch (e: any) {
    return e?.name === 'NotAllowedError' ? NEVER : DENIED;
  }
  return GRANTED; // storage, calendar, bluetooth ...: no browser gate
}
export const PermissionsAndroid = {
  PERMISSIONS: new Proxy({} as Record<string, string>, { get: (_t, k) => `android.permission.${String(k)}` }),
  RESULTS: { GRANTED, DENIED, NEVER_ASK_AGAIN: NEVER },
  request: (permission: string) => requestPermission(permission),
  check: async (permission: string) => {
    try {
      const name = /RECORD_AUDIO/.test(permission) ? 'microphone' : /CAMERA/.test(permission) ? 'camera' : /LOCATION/.test(permission) ? 'geolocation' : null;
      if (name && navigator.permissions?.query) {
        const r = await navigator.permissions.query({ name: name as PermissionName });
        return r.state === 'granted';
      }
    } catch {
      /* Safari / Firefox reject some names */
    }
    return !/RECORD_AUDIO|CAMERA|LOCATION|NOTIFICATION/.test(permission);
  },
  requestMultiple: async (permissions: string[]) => {
    const out: Record<string, string> = {};
    for (const p of permissions) out[p] = await requestPermission(p);
    return out;
  },
};

// Native view components: the map view is implemented here (map/MapView.tsx); any other name gets null, and the app's own
// `requireNativeComponent(...) : null` guards keep working.
export function requireNativeComponent(name: string): any {
  return name === 'AtlasMapView' ? AtlasMapView : null;
}
export const UIManager = {
  ...(RNW.UIManager as any),
  hasViewManagerConfig: (name: string) => name === 'AtlasMapView',
  getViewManagerConfig: (name: string) => (name === 'AtlasMapView' ? { NativeProps: {} } : null),
};

// Clipboard: react-native-web keeps one; make setString/getString work against the async clipboard API.
export const Clipboard = {
  setString: (text: string) => {
    void navigator.clipboard?.writeText(text).catch(() => undefined);
  },
  getString: async () => {
    try {
      return (await navigator.clipboard.readText()) ?? '';
    } catch {
      return '';
    }
  },
};

export const Linking = {
  ...(RNW as any).Linking,
  openURL: async (url: string) => {
    if (/^(tel|mailto|sms|geo):/i.test(url)) {
      window.location.href = url;
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  },
  canOpenURL: async () => true,
  openSettings: async () => undefined,
  sendIntent: async () => undefined,
  // PWA shortcuts open "?open=chat"; the Windows app is launched with an atlas:// argument. Both reach the app as the
  // atlas://app/<where> links the phone's launcher shortcuts use.
  getInitialURL: async () => {
    const host = (globalThis as any).atlasHost;
    if (host?.initialUrl) return host.initialUrl as string;
    const u = new URL(window.location.href);
    const open = u.searchParams.get('open');
    return open ? `atlas://app/${open}` : u.searchParams.get('url') || null;
  },
  addEventListener: (type: string, cb: (e: { url: string }) => void) => (type === 'url' ? bus.addListener('AtlasOpenUrl', (e: { url: string }) => cb(e)) : { remove: () => undefined }),
};

export const Share = {
  share: async (content: { message?: string; url?: string; title?: string }) => {
    if (navigator.share) {
      try {
        await navigator.share({ title: content.title, text: content.message, url: content.url });
        return { action: 'sharedAction' };
      } catch {
        return { action: 'dismissedAction' };
      }
    }
    await navigator.clipboard?.writeText([content.message, content.url].filter(Boolean).join('\n'));
    showToast('Copied to clipboard');
    return { action: 'sharedAction' };
  },
  get: () => null,
  sharedAction: 'sharedAction',
  dismissedAction: 'dismissedAction',
};

export const Vibration = {
  vibrate: (pattern?: number | number[]) => {
    try {
      navigator.vibrate?.(pattern ?? 400);
    } catch {
      /* not supported */
    }
  },
  cancel: () => {
    try {
      navigator.vibrate?.(0);
    } catch {
      /* not supported */
    }
  },
};

// Hardware back button: browsers have none inside the page. The handlers are kept so code that registers one
// keeps working; the Escape key and the browser's own back gesture trigger them in registration order.
const backHandlers: Array<() => boolean | null | undefined> = [];
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    for (let i = backHandlers.length - 1; i >= 0; i--) if (backHandlers[i]()) { e.preventDefault(); return; }
  });
}
export const BackHandler = {
  addEventListener(_event: string, handler: () => boolean | null | undefined) {
    backHandlers.push(handler);
    return { remove: () => { const i = backHandlers.indexOf(handler); if (i >= 0) backHandlers.splice(i, 1); } };
  },
  removeEventListener(_event: string, handler: () => boolean | null | undefined) {
    const i = backHandlers.indexOf(handler);
    if (i >= 0) backHandlers.splice(i, 1);
  },
  exitApp() { window.close(); },
};

// react-native-web's InteractionManager does not run a plain function task the way React Native does
// (the chat screen waited on it forever before loading a model). Same contract as React Native: run the
// task after pending interactions, i.e. on the next frame, and return { then, done, cancel }.
export const InteractionManager = {
  Events: { interactionStart: 'interactionStart', interactionComplete: 'interactionComplete' },
  runAfterInteractions(task?: (() => unknown) | { run?: () => unknown }) {
    let cancelled = false;
    const promise = new Promise<unknown>((resolve) => {
      const go = () => {
        if (cancelled) return;
        const r = typeof task === 'function' ? task() : task?.run?.();
        resolve(r);
      };
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => setTimeout(go, 0));
      else setTimeout(go, 0);
    });
    return { then: promise.then.bind(promise), done: promise.then.bind(promise), cancel: () => { cancelled = true; } };
  },
  createInteractionHandle: () => 1,
  clearInteractionHandle: () => undefined,
  setDeadline: () => undefined,
  addListener: () => ({ remove: () => undefined }),
};
