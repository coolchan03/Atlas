import { renderHook, act } from '@testing-library/react-native';
import { resetStores } from '../../utils/testHelpers';
import { useAppStore } from '../../../src/stores/appStore';
import { useTextGenerationAdvanced } from '../../../src/hooks/useTextGenerationAdvanced';

describe('useTextGenerationAdvanced', () => {
  beforeEach(() => {
    resetStores();
  });

  // HTP is currently disabled via HTP_ENABLED feature flag
  it('keeps the chosen KV cache type changeable even when the backend runs f16', () => {
    act(() => {
      useAppStore.getState().updateSettings({ inferenceBackend: 'htp', cacheType: 'q4_0' });
    });

    const { result } = renderHook(() => useTextGenerationAdvanced());

    expect(result.current.gpuForcesF16).toBe(true);
    expect(result.current.cacheDisabled).toBe(false);
    expect(result.current.displayCacheType).toBe('q4_0');
    act(() => result.current.handleCacheTypeChange('q8_0'));
    expect(useAppStore.getState().settings.cacheType).toBe('q8_0');
  });

  it('shows Auto (N) for cpu threads when nThreads uses the auto sentinel', async () => {
    act(() => {
      useAppStore.getState().updateSettings({ nThreads: 0 });
    });

    const { result } = renderHook(() => useTextGenerationAdvanced());

    await act(async () => {});

    expect(result.current.cpuThreadsDisplayValue).toMatch(/^Auto \(\d+\)$/);
    expect(result.current.cpuThreadsSliderValue).toBe(1);
  });
});
