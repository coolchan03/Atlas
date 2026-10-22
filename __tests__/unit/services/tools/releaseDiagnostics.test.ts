jest.mock('react-native', () => ({ NativeModules: {}, Platform: { OS: 'android' } }));
jest.mock('../../../../src/atlasTools/deviceTools', () => ({ confirm: jest.fn().mockResolvedValue(true) }));
jest.mock('../../../../src/services/presentationExport', () => ({
  pptxParts: (slides: any[]) => Object.fromEntries(slides.map((_s, i) => [
    'ppt/slides/slide' + (i + 1) + '.xml', '<p:sp><a:t>Text</a:t></p:sp>',
  ])),
}));
import * as DT from '../../../../src/atlasTools/deviceTools';
import {
  collectReleaseDiagnostics, formatReleaseDiagnostics, runReleaseDiagnostics,
} from '../../../../src/services/tools/releaseDiagnostics';

const createNative = () => ({
  AtlasPresentationExporter: { exportPdf: jest.fn() },
  AtlasEnvironment: { snapshot: jest.fn().mockResolvedValue({
    sampledAt: Date.now(), wifi: { available: true, enabled: true, connected: true },
    bluetooth: { available: true, enabled: true, permissionGranted: true },
    pressureHpa: 1015.1, sensors: { pressure: true, ambientTemperature: false },
  }) },
  AtlasHealthConnect: { status: jest.fn().mockResolvedValue({
    available: true, permissions: { steps: false, heartRate: false },
  }), readSummary: jest.fn() },
  AtlasScheduledDrafts: { list: jest.fn().mockResolvedValue([]), schedule: jest.fn() },
  AtlasCodeRunner: { runJavascript: jest.fn().mockResolvedValue(JSON.stringify({
    ok: true, logs: ['smoke'], tests: [{ name: 'arithmetic', passed: true }],
  })) },
});
describe('privacy-preserving on-device release diagnostics', () => {
  it('reports native capabilities and never reads records or sends messages', async () => {
    const native = createNative();
    const rows = await collectReleaseDiagnostics(native);
    expect(rows).toHaveLength(7);
    expect(rows.every(row => row.status === 'pass')).toBe(true);
    expect(rows.find(row => row.name === 'Environmental sensors')?.detail).toContain('1015.1 hPa');
    expect(native.AtlasHealthConnect.readSummary).not.toHaveBeenCalled();
    expect(native.AtlasScheduledDrafts.schedule).not.toHaveBeenCalled();
    expect(native.AtlasPresentationExporter.exportPdf).not.toHaveBeenCalled();
    expect(native.AtlasCodeRunner.runJavascript).toHaveBeenCalledTimes(1);
    expect(formatReleaseDiagnostics(rows)).toContain('7 pass');
  });
  it('distinguishes unsupported sensors from native-module failures', async () => {
    const native = createNative();
    delete (native as any).AtlasEnvironment;
    const rows = await collectReleaseDiagnostics(native);
    expect(rows.find(row => row.name === 'Environmental sensors')?.status).toBe('fail');
    expect(formatReleaseDiagnostics(rows)).toContain('1 fail');
  });
  it('requires user consent to run an actual self-test', async () => {
    (DT.confirm as jest.Mock).mockResolvedValueOnce(false);
    await expect(runReleaseDiagnostics()).resolves.toContain('cancelled');
  });
});
