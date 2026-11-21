import { installNativeBoundary, requireRTL } from '../harness/nativeBoundary';

it('shows cache sizes, frees only the ticked ones and leaves models alone', async () => {
  const boundary = installNativeBoundary({ fs: true });
  const rtl = requireRTL();
  const React = require('react');
  const RNFS = require('react-native-fs');
  boundary.fs!.seedFile(`${RNFS.CachesDirectoryPath}/podcast-audio/a.mp3`, 3 * 1024 * 1024);
  boundary.fs!.seedFile(`${RNFS.CachesDirectoryPath}/updates/new.apk`, 1024 * 1024);
  boundary.fs!.seedFile(`${RNFS.CachesDirectoryPath}/models/keep.gguf`, 50 * 1024 * 1024);
  const { CacheCleanupSection } = require('../../src/screens/storage/CacheCleanupSection');
  const { useTasks } = require('../../src/tasks/taskRegistry');
  useTasks.setState({ tasks: [] });
  const { Alert } = require('react-native');
  jest.spyOn(Alert, 'alert').mockImplementation((_t: any, _m: any, buttons: any) => { buttons.find((b: any) => b.text === 'Free space').onPress(); });
  const view = rtl.render(React.createElement(CacheCleanupSection));
  await rtl.waitFor(() => expect(view.getByTestId('cache-podcast-audio')).toBeTruthy());
  expect(view.queryByTestId('cache-models')).toBeNull(); // models are never offered
  rtl.fireEvent.press(view.getByTestId('cache-updates')); // untick the updates
  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId('cache-free')); });
  await rtl.waitFor(() => expect(view.getByTestId('cache-message').props.children).toMatch(/Freed 3/));
  expect(await RNFS.exists(`${RNFS.CachesDirectoryPath}/models/keep.gguf`)).toBe(true);
  expect(await RNFS.exists(`${RNFS.CachesDirectoryPath}/updates/new.apk`)).toBe(true);
  expect(await RNFS.exists(`${RNFS.CachesDirectoryPath}/podcast-audio`)).toBe(false);
});
