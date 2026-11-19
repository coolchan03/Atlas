import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

const mockStatus = jest.fn();
const mockGen = jest.fn();
jest.mock('../../src/services/geniexEngine', () => ({
  geniexStatus: (...a: unknown[]) => mockStatus(...a), geniexUsable: (s: any) => s.packaged && s.chipSupported,
  loadGeniex: jest.fn(async () => undefined), unloadGeniex: jest.fn(async () => undefined), generateGeniex: (...a: unknown[]) => mockGen(...a),
}));
jest.mock('../../src/services/activeModelService', () => ({ activeModelService: { unloadAllModels: jest.fn(async () => ({})), loadTextModel: jest.fn(async () => undefined) } }));
jest.mock('../../src/services/llm', () => ({ llmService: { generateWithMaxTokens: jest.fn(async () => 'x'), getPerformanceStats: () => ({ lastTimeToFirstToken: 1, lastDecodeTokensPerSecond: 10, lastTokensPerSecond: 10 }) } }));
jest.mock('../../src/services/hardware', () => ({ hardwareService: { getProcessMemory: async () => ({ footprintMB: 2000 }) } }));
jest.mock('react-native-device-info', () => ({ __esModule: true, default: { getModel: () => 'Test phone' } }));

import { EngineCompareCard } from '../../src/components/EngineCompareCard';

const model: any = { id: 'm', name: 'M', fileName: 'm-Q4_0.gguf', filePath: '/m-Q4_0.gguf', engine: 'llama' };

describe('compare with GenieX', () => {
  it('is hidden when GenieX is not in this APK or the chip is unsupported', async () => {
    mockStatus.mockResolvedValue({ packaged: false, chipSupported: false, soc: '', reason: 'no' });
    const { queryByTestId } = render(<EngineCompareCard model={model} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(queryByTestId('engine-compare')).toBeNull();
  });

  it('runs both engines and says llama.rn stays, because GenieX here lacks tools', async () => {
    mockStatus.mockResolvedValue({ packaged: true, chipSupported: true, soc: 'SM8750', reason: '' });
    mockGen.mockResolvedValue({ text: 'y', timings: { ttftMs: 300, prefillTps: 200, decodeTps: 30, promptTokens: 10, generatedTokens: 20, stopReason: 'eos' } });
    const { findByTestId, getByTestId, getByText } = render(<EngineCompareCard model={model} />);
    fireEvent.press(await findByTestId('engine-compare-start'));
    await waitFor(() => expect(getByTestId('engine-compare-result')).toBeTruthy(), { timeout: 5000 });
    expect(getByText(/llama.rn: writes 10.0 per second/)).toBeTruthy();
    expect(getByText(/GenieX: writes 30.0 per second/)).toBeTruthy();
    expect(getByText('Keep llama.rn')).toBeTruthy();
    expect(getByText(/Drops what the current engine does: tools/)).toBeTruthy();
  });
});
