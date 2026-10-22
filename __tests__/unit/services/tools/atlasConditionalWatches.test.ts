jest.mock('react-native', () => ({
  Platform: { OS: 'android', Version: 35 },
  NativeModules: { AtlasConditionalWatches: {
    create: jest.fn().mockResolvedValue('9f4f4be8-81dd-4ccf-8c3b-000000000003'),
    list: jest.fn().mockResolvedValue([]),
    cancel: jest.fn().mockResolvedValue(true),
  } },
  PermissionsAndroid: {
    PERMISSIONS: { POST_NOTIFICATIONS: 'post' },
    RESULTS: { GRANTED: 'granted' },
    request: jest.fn().mockResolvedValue('granted'),
  },
}));
jest.mock('../../../../src/atlasTools/deviceTools', () => ({ confirm: jest.fn().mockResolvedValue(true) }));
import { NativeModules } from 'react-native';
import * as DT from '../../../../src/atlasTools/deviceTools';
import { validateConditionalRule, createConditionalWatch, listConditionalWatches, cancelConditionalWatch } from '../../../../src/services/tools/conditionalWatches';

describe('Generic conditional notifications', () => {
  beforeEach(() => jest.clearAllMocks());
  const sample = { name: 'Availability alert', kind: 'json' as const,
    url: 'https://example.com/api/stock', path: 'inventory.count',
    operator: 'gt' as const, target: 0, pollHours: 6 };
  it('accepts numerical inventory conditions and page-change monitors', () => {
    expect(validateConditionalRule(sample).kind).toBe('json');
    expect(validateConditionalRule({ name: 'Page changed', kind: 'change', url: 'https://example.com/updates' }).pollHours).toBe(6);
  });
  it('rejects private/invalid URLs and unsupported conditions', () => {
    for (const url of ['http://example.com/a', 'https://localhost/page', 'https://192.168.1.10/page', 'https://example.local/page']) {
      expect(() => validateConditionalRule({ ...sample, url })).toThrow();
    }
    expect(() => validateConditionalRule({ ...sample, operator: 'gt', target: 'free' })).toThrow();
    expect(() => validateConditionalRule({ ...sample, kind: 'text', allOf: [] })).toThrow();
  });
  it('requires approval and delegates creation to Android', async () => {
    await createConditionalWatch(JSON.stringify(sample));
    expect(NativeModules.AtlasConditionalWatches.create).toHaveBeenCalledTimes(1);
    expect(await listConditionalWatches()).toContain('No conditional watches');
    await cancelConditionalWatch('9f4f4be8-81dd-4ccf-8c3b-000000000003');
    expect(NativeModules.AtlasConditionalWatches.cancel).toHaveBeenCalledTimes(1);
    (DT.confirm as jest.Mock).mockResolvedValueOnce(false);
    await createConditionalWatch(JSON.stringify(sample));
    expect(NativeModules.AtlasConditionalWatches.create).toHaveBeenCalledTimes(1);
  });
});
