jest.mock('react-native', () => ({
  Platform: { OS: 'android', Version: 35 },
  NativeModules: { AtlasMovieWatches: {
    watch: jest.fn().mockResolvedValue('9f4f4be8-81dd-4ccf-8c3b-000000000002'),
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
import { movieWatchTitle, watchMovieRelease, listMovieWatches, cancelMovieWatch } from '../../../../src/services/tools/movieWatches';

describe('Atlas movie release news watches', () => {
  beforeEach(() => jest.clearAllMocks());
  it('validates the movie title', () => {
    expect(movieWatchTitle('The Addams Family')).toBe('The Addams Family');
    expect(() => movieWatchTitle('../evil')).toThrow();
    expect(() => movieWatchTitle('')).toThrow();
  });
  it('requires explicit approval and creates a background news watch', async () => {
    await watchMovieRelease('The Addams Family');
    expect(NativeModules.AtlasMovieWatches.watch).toHaveBeenCalledWith('The Addams Family');
    expect(await listMovieWatches()).toContain('No movie');
    await cancelMovieWatch('9f4f4be8-81dd-4ccf-8c3b-000000000002');
    expect(NativeModules.AtlasMovieWatches.cancel).toHaveBeenCalledTimes(1);
    (DT.confirm as jest.Mock).mockResolvedValueOnce(false);
    await watchMovieRelease('The Addams Family');
    expect(NativeModules.AtlasMovieWatches.watch).toHaveBeenCalledTimes(1);
  });
});
