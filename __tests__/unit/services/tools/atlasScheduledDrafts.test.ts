jest.mock('react-native', () => ({
  Platform: { OS: 'android', Version: 35 },
  NativeModules: { AtlasScheduledDrafts: {
    schedule: jest.fn().mockResolvedValue('9f4f4be8-81dd-4ccf-8c3b-000000000001'),
    list: jest.fn().mockResolvedValue([]),
    cancel: jest.fn().mockResolvedValue(true),
  } },
  PermissionsAndroid: {
    PERMISSIONS: { POST_NOTIFICATIONS: 'post' },
    RESULTS: { GRANTED: 'granted' },
    request: jest.fn().mockResolvedValue('granted'),
  },
}));
jest.mock('../../../../src/atlasTools/deviceTools', () => ({
  confirm: jest.fn().mockResolvedValue(true),
}));
import { NativeModules } from 'react-native';
import * as DT from '../../../../src/atlasTools/deviceTools';
import { scheduledTime, scheduleTextDraft, listScheduledTextDrafts, cancelScheduledTextDraft } from '../../../../src/services/tools/scheduledDrafts';
describe('Scheduled SMS draft', () => {
  beforeEach(() => jest.clearAllMocks());
  it('rejects invalid dates and accepts valid future dates', () => {
    expect(() => scheduledTime('nonsense')).toThrow();
    expect(() => scheduledTime('2026-01-01T00:00:00Z', Date.parse('2026-10-22T00:00:00Z'))).toThrow();
    expect(scheduledTime('2026-10-23T12:00:00Z', Date.parse('2026-10-22T00:00:00Z')))
      .toBe(Date.parse('2026-10-23T12:00:00Z'));
  });
  it('requires approval, and does not send a message', async () => {
    const time = new Date(Date.now() + 86400000).toISOString();
    await scheduleTextDraft('+1 (555) 123-4567', 'Hello tomorrow', time);
    expect(NativeModules.AtlasScheduledDrafts.schedule).toHaveBeenCalledWith('+15551234567', 'Hello tomorrow', Date.parse(time));
    expect(await listScheduledTextDrafts()).toContain('No scheduled text');
    await cancelScheduledTextDraft('9f4f4be8-81dd-4ccf-8c3b-000000000001');
    expect(NativeModules.AtlasScheduledDrafts.cancel).toHaveBeenCalledTimes(1);
    (DT.confirm as jest.Mock).mockResolvedValueOnce(false);
    await scheduleTextDraft('+15551234567', 'Not now', time);
    expect(NativeModules.AtlasScheduledDrafts.schedule).toHaveBeenCalledTimes(1);
  });
});
