import { AppState, NativeModules, PermissionsAndroid, Platform } from 'react-native';

export type Vector = { x: number; y: number; z: number };
export interface SensorSnapshot {
  sampledAt: number;
  wifi?: { available: boolean; enabled: boolean; connected: boolean };
  bluetooth?: { available: boolean; enabled?: boolean; permissionGranted: boolean };
  sensors?: Record<string, boolean>;
  battery?: { percent?: number; charging?: boolean; batteryTemperatureC?: number };
  pressureHpa?: number; pressureChangeHpaPerHour?: number;
  ambientTemperatureC?: number; temperatureChangeCPerHour?: number;
  humidityPercent?: number; lightLux?: number; proximityCm?: number;
  accelerationMs2?: Vector; rotationRadPerSec?: Vector; magneticMicroT?: Vector;
}

interface SensorView {
  snapshot: SensorSnapshot | null;
  error: string;
  loading: boolean;
}

/** One page's polling owner. Native samples may finish after blur; those results stay out of the view. */
export class SensorToolkitSession {
  private view: SensorView = { snapshot: null, error: '', loading: false };
  private listeners = new Set<() => void>();
  private focused = false;
  private active = false;
  private visit = 0;
  private generation = 0;
  private busy = false;
  private refreshPending = false;
  private interval: ReturnType<typeof setInterval> | undefined;

  getSnapshot = (): SensorView => this.view;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private publish(change: Partial<SensorView>): void {
    this.view = { ...this.view, ...change };
    this.listeners.forEach(listener => listener());
  }

  focus = (): (() => void) => {
    this.focused = true;
    this.visit++;
    const subscription = AppState.addEventListener('change', state => {
      this.setActive(this.focused && state === 'active');
    });
    this.setActive(AppState.currentState === 'active');
    return () => {
      this.focused = false;
      this.visit++;
      this.setActive(false);
      subscription.remove();
    };
  };

  private setActive(active: boolean): void {
    if (active === this.active) return;
    this.active = active;
    this.generation++;
    this.refreshPending = false;
    clearInterval(this.interval);
    this.interval = undefined;
    if (active) {
      void this.refresh();
      this.interval = setInterval(() => { void this.refresh(); }, 12000);
    } else {
      this.publish({ loading: false });
    }
  }

  refresh = async (): Promise<void> => {
    if (!this.active) return;
    if (this.busy) {
      // A previous visit's native sample cannot be cancelled. Refresh as soon as it settles.
      this.refreshPending = true;
      this.publish({ loading: true });
      return;
    }
    const native = NativeModules.AtlasEnvironment;
    if (!native?.snapshot) {
      this.publish({ error: 'Environmental sensor module is unavailable in this APK.', loading: false });
      return;
    }
    this.busy = true;
    this.refreshPending = false;
    const generation = this.generation;
    this.publish({ loading: true });
    try {
      const snapshot: SensorSnapshot = await native.snapshot();
      if (this.active && generation === this.generation) this.publish({ snapshot, error: '' });
    } catch (error) {
      if (this.active && generation === this.generation) {
        this.publish({ error: error instanceof Error ? error.message : String(error) });
      }
    } finally {
      this.busy = false;
      if (this.active && generation === this.generation) this.publish({ loading: false });
      if (this.active && this.refreshPending) {
        this.refreshPending = false;
        void this.refresh();
      }
    }
  };

  requestBluetooth = async (): Promise<void> => {
    if (!this.focused || Platform.OS !== 'android' || Number(Platform.Version) < 31) return;
    // A permission dialog can briefly background the app; its result belongs to this route visit.
    const visit = this.visit;
    try {
      const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
      if (!this.focused || visit !== this.visit) return;
      if (result === PermissionsAndroid.RESULTS.GRANTED) {
        this.publish({ error: '' });
        await this.refresh();
      } else {
        this.publish({ error: 'Bluetooth permission was declined. Other sensor readings remain available.' });
      }
    } catch (error) {
      if (this.focused && visit === this.visit) {
        this.publish({ error: error instanceof Error ? error.message : 'Bluetooth permission could not be requested.' });
      }
    }
  };
}
