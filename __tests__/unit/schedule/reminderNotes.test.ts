/** A saved schedule is not a notification that will appear: the reminder is only promised when it can really be shown. */
import { Platform, NativeModules } from 'react-native';
import { notificationNote, notificationStatus, syncAlarms, checkReminders } from '../../../src/schedule/alarms';

const setNative = (mod: unknown) => { (NativeModules as any).AtlasTaskAlarms = mod; (Platform as any).OS = 'android'; };
afterEach(() => { delete (NativeModules as any).AtlasTaskAlarms; });

describe('notificationNote', () => {
  it('promises a notification only when they are on and the alarms were handed over', () => {
    expect(notificationNote({ status: 'ready', handedOver: true })).toMatch(/will appear at that time/);
  });
  it('says no reminder will appear when notifications are off, and that the task still runs with Atlas open', () => {
    const note = notificationNote({ status: 'off', handedOver: true });
    expect(note).toMatch(/switched off/);
    expect(note).toMatch(/no reminder will appear/);
    expect(note).toMatch(/still runs when Atlas is open/);
  });
  it('says so when this phone cannot schedule alarms at all', () => {
    expect(notificationNote({ status: 'unavailable', handedOver: false })).toMatch(/No notification will appear/);
  });
  it('does not promise one when the phone refused the alarms', () => {
    const note = notificationNote({ status: 'ready', handedOver: false });
    expect(note).toMatch(/did not accept/);
    expect(note).not.toMatch(/will appear at that time/);
  });
});

describe('checking the phone', () => {
  it('no native module: unavailable, nothing handed over', async () => {
    setNative(undefined);
    expect(await notificationStatus()).toBe('unavailable');
    expect(await syncAlarms()).toBe(false);
  });
  it('notifications off: off', async () => {
    setNative({ notificationsEnabled: jest.fn(async () => false), setAlarms: jest.fn(async () => undefined) });
    expect(await notificationStatus()).toBe('off');
    expect(await checkReminders()).toEqual({ status: 'off', handedOver: true });
  });
  it('notifications on and alarms accepted: ready', async () => {
    setNative({ notificationsEnabled: jest.fn(async () => true), setAlarms: jest.fn(async () => undefined) });
    expect(await checkReminders()).toEqual({ status: 'ready', handedOver: true });
  });
  it('the phone refuses the alarms: reported as not handed over, not swallowed', async () => {
    setNative({ notificationsEnabled: jest.fn(async () => true), setAlarms: jest.fn(async () => { throw new Error('exact alarms not allowed'); }) });
    expect(await syncAlarms()).toBe(false);
    expect(await checkReminders()).toEqual({ status: 'ready', handedOver: false });
  });
  it('a failing status check is unavailable, not "ready"', async () => {
    setNative({ notificationsEnabled: jest.fn(async () => { throw new Error('boom'); }), setAlarms: jest.fn() });
    expect(await notificationStatus()).toBe('unavailable');
  });
});
