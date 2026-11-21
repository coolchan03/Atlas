import { Platform } from 'react-native';
import { llmService } from '../../../src/services/llm';

const originalPlatform = Platform.OS;
afterAll(() => { Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform }); });

describe('Android native KV-cache shift safeguards', () => {
  beforeEach(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    (llmService as any).activeGpuLayers = 0;
    (llmService as any).selectedBackend = 'cpu';
  });
  afterEach(() => {
    (llmService as any).activeGpuLayers = 0;
    (llmService as any).selectedBackend = 'cpu';
  });
  it.each(['opencl', 'htp'])('disables native shifting for %s even when layer telemetry reports zero', backend => {
    (llmService as any).selectedBackend = backend;
    expect((llmService as any).shouldDisableCtxShift()).toBe(true);
  });
  it('permits CPU native shifting', () => {
    expect((llmService as any).shouldDisableCtxShift()).toBe(false);
  });
  it('disables shifting for otherwise unidentified GPU layers', () => {
    (llmService as any).activeGpuLayers = 8;
    expect((llmService as any).shouldDisableCtxShift()).toBe(true);
  });
});
