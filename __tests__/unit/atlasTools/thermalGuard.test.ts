import { levelFromBatteryTemp, nextHot, useThermal } from '../../../src/atlasTools/thermalState';
import { heatLimited, lowPowerActive, useLowPower } from '../../../src/atlasTools/lowPowerState';
import { activeAgentOverrides } from '../../../src/stores/agentStore';
import { checkThermalNow } from '../../../src/atlasTools/thermal';
import { NativeModules } from 'react-native';

describe('heat guard', () => {
  beforeEach(() => { useThermal.setState({ level: null, hot: false }); useLowPower.setState({ heatGuard: true, enabled: false, active: false }); });

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
    expect(useThermal.getState().hot).toBe(true);
    (NativeModules as any).AtlasDevice = { getThermalStatus: jest.fn().mockResolvedValue(-1), getBatteryTemperature: jest.fn().mockResolvedValue(30) };
    await checkThermalNow();
    expect(useThermal.getState().hot).toBe(false);
    delete (NativeModules as any).AtlasDevice;
  });
});

describe('telling the person', () => {
  it('says so when the guard turns on and when it turns off, but not while it stays the same or is switched off', () => {
    jest.resetModules();
    const toasts: string[] = [];
    jest.doMock('../../../src/utils/toast', () => ({ showToast: (m: string) => toasts.push(m) }));
    const { recordThermal } = require('../../../src/atlasTools/thermal');
    const { useThermal: thermal } = require('../../../src/atlasTools/thermalState');
    const { useLowPower: low } = require('../../../src/atlasTools/lowPowerState');
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
