import { useSpeedStats, fastestBackend, configKey } from '../../../src/atlasTools/speed';

beforeEach(() => useSpeedStats.setState({ byModel: {}, byConfig: {} }));

describe('speed kept per backend', () => {
  it('keeps CPU and NPU runs of the same model apart, as well as the pooled figure', () => {
    const rec = useSpeedStats.getState().record;
    for (let i = 0; i < 3; i += 1) { rec('m1', { decode: 4, backend: 'cpu' }); rec('m1', { decode: 12, backend: 'htp' }); }
    const s = useSpeedStats.getState();
    expect(s.byConfig[configKey('m1', 'cpu')].decode).toBeCloseTo(4);
    expect(s.byConfig[configKey('m1', 'HTP')].decode).toBeCloseTo(12);
    expect(s.byModel.m1.samples).toBe(6);
    expect(fastestBackend(s.byConfig, 'm1')).toEqual({ backend: 'htp', decode: expect.closeTo(12) });
  });
  it('names no winner from one backend or too few runs', () => {
    const rec = useSpeedStats.getState().record;
    rec('m2', { decode: 10, backend: 'cpu' });
    expect(fastestBackend(useSpeedStats.getState().byConfig, 'm2')).toBeNull();
    for (let i = 0; i < 3; i += 1) rec('m2', { decode: 10, backend: 'cpu' });
    expect(fastestBackend(useSpeedStats.getState().byConfig, 'm2')).toBeNull();
  });
  it('forgetting a model clears its per-backend history', () => {
    useSpeedStats.getState().record('m3', { decode: 5, backend: 'cpu' });
    useSpeedStats.getState().forget('m3');
    expect(useSpeedStats.getState().byConfig).toEqual({});
  });
});

describe('backend advice', () => {
  it('says which backend is faster only from enough real runs on each', () => {
    const { backendAdvice } = require('../../../src/atlasTools/speed');
    const rec = useSpeedStats.getState().record;
    for (let i = 0; i < 3; i += 1) { rec('m9', { decode: 4, backend: 'cpu' }); rec('m9', { decode: 12, backend: 'htp' }); }
    expect(backendAdvice(useSpeedStats.getState().byConfig, 'm9')).toBe('HTP wrote 12.0 per second here, against 4.0 on CPU (measured on this phone, 3+ replies each).');
    expect(backendAdvice({}, 'nope')).toBeNull();
  });
});
