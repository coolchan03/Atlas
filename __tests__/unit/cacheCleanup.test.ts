import { classifyCacheName, planCleanup } from '../../src/services/cacheCleanup';

describe('UX-16 safe cache cleanup', () => {
  it('only ever offers known rebuildable caches', () => {
    for (const name of ['podcast-audio', 'updates', 'llm-sessions', 'office_123', 'epub-9', 'atlas-video-4']) expect(classifyCacheName(name)).toBeDefined();
    for (const name of ['models', 'atlas-project-files', 'backups', 'image_models', 'documents', 'chat.db']) expect(classifyCacheName(name)).toBeUndefined();
  });
  it('lists the big ones first, skips empty ones, and ticks them by default', () => {
    const plan = planCleanup([
      { name: 'updates', path: '/c/updates', bytes: 5 }, { name: 'podcast-audio', path: '/c/podcast-audio', bytes: 900 },
      { name: 'models', path: '/c/models', bytes: 9_999_999 }, { name: 'epub-1', path: '/c/epub-1', bytes: 0 },
    ], false);
    expect(plan.map((i) => i.id)).toEqual(['podcast-audio', 'updates']);
    expect(plan.every((i) => i.safeByDefault)).toBe(true);
  });
  it('does not tick anything a running job may be using', () => {
    const plan = planCleanup([{ name: 'office_5', path: '/c/office_5', bytes: 10 }], true);
    expect(plan[0].safeByDefault).toBe(false); expect(plan[0].note).toMatch(/job is running/);
  });
});
