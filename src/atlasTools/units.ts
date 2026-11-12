import { useMaps, fmtDistance } from '../atlasMaps/maps';
import { useAppStore } from '../stores/appStore';

export type TempUnit = 'c' | 'f';
export interface Units { imperial: boolean; temp: TempUnit }

/** A temperature given in Celsius, shown in the person's unit. */
export const fmtTemp = (celsius: number, unit: TempUnit): string =>
  unit === 'f' ? `${Math.round(celsius * 9 / 5 + 32)}°F` : `${Math.round(celsius)}°C`;

/** A speed given in km/h, shown in the person's unit. */
export const fmtWind = (kph: number, imperial: boolean): string =>
  imperial ? `${Math.round(kph * 0.621371)} mph` : `${Math.round(kph)} km/h`;

/** The person's choices (Settings, Appearance, Units). Distance uses the same switch as Maps. */
export function currentUnits(): Units {
  return { imperial: useMaps.getState().imperial, temp: useAppStore.getState().settings.temperatureUnit ?? 'c' };
}

/** Same as `currentUnits`, and the screen redraws when either choice changes. */
export function useUnits(): Units {
  const imperial = useMaps((s) => s.imperial);
  const temp = useAppStore((s) => s.settings.temperatureUnit) ?? 'c';
  return { imperial, temp };
}

export { fmtDistance };
