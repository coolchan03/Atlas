import { ASSISTANT_PERMISSIONS, permissionRelevant } from '../../../src/components/AppPermissionsCard';

describe('Assistant permissions inventory', () => {
  it('lists each dangerous Android manifest permission once', () => {
    const ids = ASSISTANT_PERMISSIONS.map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('microphone');
    expect(ids).toContain('camera');
    expect(ids).toContain('notifications');
    expect(ids).toContain('location');
  });
  it('hides Android 13 notification request from older APIs', () => {
    expect(permissionRelevant(33, 32)).toBe(false);
    expect(permissionRelevant(33, 33)).toBe(true);
  });
});
