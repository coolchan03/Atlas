/**
 * Features that write with the AI (music, briefing, courses) used to fail unless a chat had loaded the model first: the plain
 * load failed while speech or image models held the memory. Now the memory is freed and the model loaded once before giving up.
 */
const mockCallHook = jest.fn();
jest.mock('../../../src/bootstrap/hookRegistry', () => ({ callHook: (...a: unknown[]) => mockCallHook(...a), HOOKS: { ensureTextModel: 'ensureTextModel', protectedProjectIds: 'protectedProjectIds' } }));
const mockForce = jest.fn();
jest.mock('../../../src/atlasTools/models', () => ({ forceLoadTextModel: () => mockForce() }));
jest.mock('../../../src/services/llmJobQueue', () => ({ runBackgroundJob: (job: () => Promise<any>) => job() }));
jest.mock('../../../src/services/llm', () => ({ llmService: { generateResponse: jest.fn(async () => 'a tune') } }));

import { askModel } from '../../../src/study/engine';

beforeEach(() => { mockCallHook.mockReset(); mockForce.mockReset(); });

it('loads normally when it can, without freeing anything', async () => {
  mockCallHook.mockResolvedValue(undefined);
  expect(await askModel('s', 'u')).toBe('a tune');
  expect(mockForce).not.toHaveBeenCalled();
});

it('frees memory and loads the model once when the normal load fails, then answers', async () => {
  mockCallHook.mockRejectedValue(new Error('not enough memory'));
  mockForce.mockResolvedValue(undefined);
  expect(await askModel('s', 'u')).toBe('a tune');
  expect(mockForce).toHaveBeenCalledTimes(1);
});

it('reports the original reason when even the forced load fails', async () => {
  mockCallHook.mockRejectedValue(new Error('not enough memory'));
  mockForce.mockRejectedValue(new Error('still no'));
  await expect(askModel('s', 'u')).rejects.toThrow('not enough memory');
});
