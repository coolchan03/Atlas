/** A scheduled briefing can also save itself as one audio file, ready to share when you wake. Fakes only the device boundary (files, the voice engine). */
import { installNativeBoundary, requireRTL } from '../harness/nativeBoundary';

const mockNav = { navigate: jest.fn(), goBack: jest.fn() };
jest.mock('@react-navigation/native', () => ({ ...jest.requireActual('@react-navigation/native'), useNavigation: () => mockNav }));

const wav = (): string => {
  const rate = 24000; const frames = rate / 2;
  const b = Buffer.alloc(44 + frames * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + frames * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(frames * 2, 40);
  for (let i = 0; i < frames; i++) b.writeInt16LE(Math.round(8000 * Math.sin(i / 20)), 44 + i * 2);
  return b.toString('base64');
};

it('makes the audio file after a scheduled briefing when the task asks for it, and offers it again later', async () => {
  installNativeBoundary({ fs: true });
  const { NativeModules, Platform } = require('react-native');
  Platform.OS = 'android';
  NativeModules.AtlasTts = {
    stop: jest.fn(async () => true), setVoice: jest.fn(async () => true), setPitch: jest.fn(async () => true), setRate: jest.fn(async () => true),
    synthesizeToFile: jest.fn(async (_t: string, out: string) => { await require('react-native-fs').writeFile(out, wav(), 'base64'); return out; }),
    addListener: jest.fn(), removeListeners: jest.fn(),
  };
  const rtl = requireRTL();
  const React = require('react');
  const { useStudyStore } = require('../../src/study/engine');
  const { BRIEF_PROJECT } = require('../../src/atlasTools/dailyBrief');
  const { useSchedule } = require('../../src/schedule/store');
  const { runTask } = require('../../src/schedule/runner');
  const { useEpisodeAudio, audioFor } = require('../../src/atlasVoice/episodeAudioStore');
  const { ScheduleScreen } = require('../../src/schedule/ScheduleScreen');

  // The task form has the choice.
  const screen = rtl.render(React.createElement(ScheduleScreen));
  rtl.fireEvent.press(screen.getByTestId('task-new'));
  rtl.fireEvent.press(screen.getByTestId('task-kind-briefing'));
  rtl.fireEvent.press(screen.getByTestId('task-save-audio'));
  rtl.fireEvent.press(screen.getByTestId('task-save'));
  const task = useSchedule.getState().tasks[0];
  expect(task).toMatchObject({ kind: 'briefing', saveAudio: true });

  // Today's briefing is already written (the run only makes the audio then).
  const createdAt = Date.now();
  useStudyStore.getState().add(BRIEF_PROJECT, {
    kind: 'podcast', createdAt, topic: 'News', title: 'Morning news', sources: [], hosts: 2, minutes: 1, storyStarts: [1],
    podcast: [{ host: 'A', text: 'Good morning.' }, { host: 'B', text: 'First story.' }, { host: 'A', text: 'Second.' }],
  });
  expect(await runTask(task.id)).toBeNull();
  const last = useEpisodeAudio.getState().last;
  expect(last.key).toBe(`${BRIEF_PROJECT}-${createdAt}`);
  expect(last.seconds).toBeGreaterThan(1.5);
  expect(await audioFor(last.key)).toMatchObject({ path: last.path });
  expect(await audioFor('something-else')).toBeNull();
}, 30000);
