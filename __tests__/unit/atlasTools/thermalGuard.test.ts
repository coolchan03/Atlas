import { levelFromBatteryTemp, nextHot, useThermal } from '../../../src/atlasTools/thermalState';
import { heatLimited, lowPowerActive, useLowPower } from '../../../src/atlasTools/lowPowerState';
import { activeAgentOverrides } from '../../../src/stores/agentStore';
import { checkThermalNow } from '../../../src/atlasTools/thermal';
import { NativeModules } from 'react-native';

describe('heat guard', () => {
  beforeEach(() => { useThermal.setState({ level: null, hot: false, hotStreak: 0 }); useLowPower.setState({ heatGuard: true, enabled: false, active: false }); });

  it('turns on at severe and off only at light or below', () => {
    expect(nextHot(false, 2)).toBe(false);
    expect(nextHot(false, 3)).toBe(true);
    expect(nextHot(true, 2)).toBe(true);
    expect(nextHot(true, 1)).toBe(false);
  });

  it('stands in the battery temperature when the phone reports no thermal status', () => {
    expect(levelFromBatteryTemp(43, false)).toBe(3);
    expect(levelFromBatteryTemp(40, true)).toBe(3);
    expect(levelFromBatteryTemp(40, false)).toBe(2);
    expect(levelFromBatteryTemp(36, true)).toBe(0);
  });

  it('keeps answers short while hot, and stops when switched off or cooled', () => {
    expect(activeAgentOverrides().maxTokens).toBeUndefined();
    useThermal.getState().set(4);
    expect(heatLimited()).toBe(true);
    expect(lowPowerActive()).toBe(true);
    expect(activeAgentOverrides().maxTokens).toBe(useLowPower.getState().maxTokens);
    useLowPower.setState({ heatGuard: false });
    expect(lowPowerActive()).toBe(false);
    useLowPower.setState({ heatGuard: true });
    useThermal.getState().set(0);
    expect(lowPowerActive()).toBe(false);
  });

  it('reads Android thermal status first, then the battery temperature', async () => {
    (NativeModules as any).AtlasDevice = { getThermalStatus: jest.fn().mockResolvedValue(3), getBatteryTemperature: jest.fn().mockResolvedValue(30) };
    await checkThermalNow();
    expect(useThermal.getState().hot).toBe(false); // one SEVERE reading is not enough
    await checkThermalNow();
    expect(useThermal.getState().hot).toBe(true);
    (NativeModules as any).AtlasDevice = { getThermalStatus: jest.fn().mockResolvedValue(-1), getBatteryTemperature: jest.fn().mockResolvedValue(30) };
    await checkThermalNow();
    expect(useThermal.getState().hot).toBe(false);
    delete (NativeModules as any).AtlasDevice;
  });
});

describe('a transient reading does not interrupt work', () => {
  beforeEach(() => { useThermal.setState({ level: null, hot: false, hotStreak: 0 }); useLowPower.setState({ heatGuard: true, enabled: false, active: false }); });

  it('one SEVERE reading followed by a cool one never engages the guard', () => {
    useThermal.getState().set(3);
    expect(heatLimited()).toBe(false);
    useThermal.getState().set(0);
    useThermal.getState().set(3);
    expect(heatLimited()).toBe(false); // the streak restarted: still only one reading in a row
  });

  it('SEVERE on two readings in a row engages it', () => {
    useThermal.getState().set(3);
    useThermal.getState().set(3);
    expect(heatLimited()).toBe(true);
  });

  it('CRITICAL engages at once, because components are already shutting down', () => {
    useThermal.getState().set(4);
    expect(heatLimited()).toBe(true);
  });

  it('MODERATE never engages it, however long it lasts', () => {
    for (let i = 0; i < 6; i += 1) useThermal.getState().set(2);
    expect(heatLimited()).toBe(false);
  });

  it('once engaged it still releases only at light or below (no flicker near the line)', () => {
    useThermal.getState().set(3); useThermal.getState().set(3);
    useThermal.getState().set(2);
    expect(heatLimited()).toBe(true);
    useThermal.getState().set(1);
    expect(heatLimited()).toBe(false);
  });

  it('the guard stays switched off when the person has not switched it on, whatever the reading', () => {
    useLowPower.setState({ heatGuard: false });
    useThermal.getState().set(4);
    expect(heatLimited()).toBe(false);
  });
});

describe('telling the person', () => {
  it('says so when the guard turns on and when it turns off, but not while it stays the same or is switched off', async () => {
    jest.resetModules();
    const toasts: string[] = [];
    jest.doMock('../../../src/utils/toast', () => ({ showToast: (m: string) => toasts.push(m) }));
    const { recordThermal } = require('../../../src/atlasTools/thermal');
    const { useThermal: thermal } = require('../../../src/atlasTools/thermalState');
    const { useLowPower: low } = require('../../../src/atlasTools/lowPowerState');
    await low.persist.rehydrate(); await require('../../../src/atlasTools/nudges').useNudges.persist.rehydrate(); // the saved settings are loaded
    thermal.setState({ level: null, hot: false });
    low.setState({ heatGuard: true });
    recordThermal(4); recordThermal(4);
    expect(toasts).toEqual(['The phone is hot: keeping answers short until it cools.']);
    recordThermal(0);
    expect(toasts[1]).toBe('The phone has cooled: back to full speed.');
    low.setState({ heatGuard: false });
    recordThermal(4); recordThermal(0);
    expect(toasts).toHaveLength(2);
  });
});

describe('before the saved settings are loaded', () => {
  it('says nothing about the heat guard (it would look switched on even if the person switched it off)', () => {
    jest.resetModules();
    const toasts: string[] = [];
    jest.doMock('../../../src/utils/toast', () => ({ showToast: (m: string) => toasts.push(m) }));
    const { recordThermal } = require('../../../src/atlasTools/thermal');
    const { useLowPower: low } = require('../../../src/atlasTools/lowPowerState');
    const { useThermal: thermal } = require('../../../src/atlasTools/thermalState');
    thermal.setState({ level: null, hot: false });
    const spy = jest.spyOn(low.persist, 'hasHydrated').mockReturnValue(false);
    recordThermal(4);
    expect(toasts).toEqual([]);
    spy.mockReturnValue(true);
    low.setState({ heatGuard: false });
    recordThermal(0); recordThermal(4);
    expect(toasts).toEqual([]); // switched off: still nothing
  });
});

describe('the heat guard is not on unless it was switched on', () => {
  it('is off by default, and an older saved "on" is switched off once by the migration', () => {
    jest.isolateModules(() => {
      const mod = require('../../../src/atlasTools/lowPowerState');
      expect(mod.useLowPower.getInitialState().heatGuard).toBe(false);
      const migrate = mod.useLowPower.persist.getOptions().migrate;
      expect(migrate({ heatGuard: true, enabled: true }, 1).heatGuard).toBe(false);
      expect(migrate({ heatGuard: true }, 2).heatGuard).toBe(true);
    });
  });
});
