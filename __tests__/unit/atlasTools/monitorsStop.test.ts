/**
 * The battery and heat monitors must be stoppable. They used to start when App.tsx was imported and could never be stopped,
 * which kept every Jest worker that rendered the app alive (and in the real app, kept polling after the tree was gone).
 */
import { startThermalMonitor, stopThermalMonitor } from '../../../src/atlasTools/thermal';
import { startLowPowerMonitor, stopLowPowerMonitor } from '../../../src/atlasTools/lowPower';

describe('monitors can be stopped', () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { stopThermalMonitor(); stopLowPowerMonitor(); jest.useRealTimers(); });

  it('the heat monitor leaves no timer behind once stopped', () => {
    startThermalMonitor();
    expect(jest.getTimerCount()).toBe(1);
    stopThermalMonitor();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('the battery monitor leaves no timer behind once stopped', () => {
    startLowPowerMonitor();
    expect(jest.getTimerCount()).toBe(1);
    stopLowPowerMonitor();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('starting twice never doubles the timer, and stopping when not running is harmless', () => {
    startThermalMonitor(); startThermalMonitor();
    startLowPowerMonitor(); startLowPowerMonitor();
    expect(jest.getTimerCount()).toBe(2);
    stopThermalMonitor(); stopLowPowerMonitor();
    stopThermalMonitor(); stopLowPowerMonitor();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('can be started again after a stop (the app can be mounted again)', () => {
    startThermalMonitor(); stopThermalMonitor();
    startThermalMonitor();
    expect(jest.getTimerCount()).toBe(1);
  });
});
