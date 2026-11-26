/** Photo studio: pick a mode, choose a photo, read the result. Fakes the picker and the model. */
import { installNativeBoundary, requireRTL } from '../harness/nativeBoundary';

jest.mock('../../src/atlasTools/models', () => ({ ensureTextModel: async () => undefined }));
jest.mock('../../src/services/llmJobQueue', () => ({ runBackgroundJob: (fn: () => Promise<unknown>) => fn() }));
jest.mock('../../src/services/llm', () => ({
  llmService: {
    supportsVision: () => true,
    getPerformanceSettings: () => ({ contextLength: 4096 }),
    getPerformanceStats: () => ({ lastTokensPerSecond: 0, lastTimeToFirstToken: 0, lastTokenCount: 0 }),
    generateResponse: async (msgs: { content: string; attachments?: unknown[] }[]) => {
      const last = msgs[msgs.length - 1];
      if (last.attachments?.length) return /narrate/.test(last.content) ? 'A calm harbour wakes up as the boats go out.' : 'A harbour with wooden fishing boats at dawn.';
      return 'The quay was busy with men mending nets by hand.';
    },
  },
}));
jest.mock('react-native-image-picker', () => ({
  launchCamera: jest.fn(),
  launchImageLibrary: jest.fn(async () => ({ assets: [{ uri: 'file:///photos/harbour.jpg', type: 'image/jpeg' }] })),
}));
jest.mock('@react-navigation/native', () => ({ ...jest.requireActual('@react-navigation/native'), useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }) }));

it('the narrator describes a photo, then the time machine writes the same place a century ago', async () => {
  installNativeBoundary({ fs: true });
  const rtl = requireRTL();
  const React = require('react');
  const { PhotoStudioScreen } = require('../../src/photo/PhotoStudioScreen');
  const view = rtl.render(React.createElement(PhotoStudioScreen));

  // No vision model is selected here, and the screen says so instead of failing silently.
  expect(view.getByTestId('photo-vision-hint')).toBeTruthy();
  rtl.fireEvent.press(view.getByTestId('photo-choice-nature'));
  rtl.fireEvent.press(view.getByTestId('photo-library'));
  await rtl.waitFor(() => expect(view.getByTestId('photo-text').props.children).toMatch(/calm harbour wakes up/));
  expect(view.getByTestId('photo-original')).toBeTruthy(); // your photo stays on screen

  rtl.fireEvent.press(view.getByTestId('photo-mode-time'));
  expect(view.queryByTestId('photo-result')).toBeNull(); // a new mode starts clean
  expect(view.getByTestId('photo-blurb').props.children).toMatch(/long time ago or far ahead/);
  rtl.fireEvent.press(view.getByTestId('photo-choice-past100'));
  rtl.fireEvent.press(view.getByTestId('photo-library'));
  await rtl.waitFor(() => expect(view.getByTestId('photo-text').props.children).toMatch(/men mending nets/));
  expect(view.getByTestId('photo-note').props.children).toMatch(/Choose an image model/); // no picture model: the passage still comes
}, 30000);
