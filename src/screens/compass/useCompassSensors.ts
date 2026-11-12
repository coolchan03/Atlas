import { useEffect, useState } from 'react';
import { NativeEventEmitter, NativeModules } from 'react-native';

const Native: any = NativeModules.AtlasDevice;

export interface CompassSensors {
  heading: number | null;
  accuracy: number | null;
  accel: { x: number; y: number; z: number; g: number } | null;
  orientation: { pitch: number; roll: number } | null;
  pressure: { hpa: number; altM: number } | null;
  batteryTemp: number | null;
}

/** Subscribes to the native heading, motion, pressure and battery-temperature sensors while the screen is open. */
export function useCompassSensors(): CompassSensors {
  const [heading, setHeading] = useState<number | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [accel, setAccel] = useState<CompassSensors['accel']>(null);
  const [orientation, setOrientation] = useState<CompassSensors['orientation']>(null);
  const [pressure, setPressure] = useState<CompassSensors['pressure']>(null);
  const [batteryTemp, setBatteryTemp] = useState<number | null>(null);

  useEffect(() => {
    if (!Native) return;
    const em = new NativeEventEmitter(Native);
    const a = em.addListener('AtlasCompass', (e: { heading: number }) => {
      if (Number.isFinite(e.heading)) setHeading(((e.heading % 360) + 360) % 360);
    });
    const b = em.addListener('AtlasCompassAccuracy', (e: { accuracy: number }) => {
      if (Number.isFinite(e.accuracy)) setAccuracy(e.accuracy);
    });
    const c = em.addListener('AtlasAccelerometer', (e: { x: number; y: number; z: number; g: number }) => setAccel(e));
    const d = em.addListener('AtlasOrientation', (e: { pitch: number; roll: number }) => setOrientation(e));
    Native.startCompass().catch(() => undefined);
    return () => { a.remove(); b.remove(); c.remove(); d.remove(); Native.stopCompass().catch(() => undefined); };
  }, []);

  useEffect(() => {
    if (!Native?.startPressure) return;
    const em = new NativeEventEmitter(Native);
    const sub = em.addListener('AtlasPressure', (e: { hpa: number; altM: number }) => setPressure(e));
    Native.startPressure().catch(() => undefined);
    return () => { sub.remove(); Native.stopPressure().catch(() => undefined); };
  }, []);

  useEffect(() => {
    if (!Native?.getBatteryTemperature) return;
    const fetchTemp = () => Native.getBatteryTemperature().then((t: number) => setBatteryTemp(t)).catch(() => null);
    fetchTemp();
    const id = setInterval(fetchTemp, 30000);
    return () => clearInterval(id);
  }, []);

  return { heading, accuracy, accel, orientation, pressure, batteryTemp };
}
