/**
 * The cloning voice's hidden lab: seven quick taps on the version open it, it runs the chosen cloned voice at several steps with a
 * fake engine, shows each run's numbers with both ways to play it, and says in plain words what the numbers suggest.
 */
import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
}));
jest.mock('../../../src/hooks/useFocusTrigger', () => ({ useFocusTrigger: () => 0 }));
jest.mock('llama.rn', () => ({ BuildInfo: { number: 'test' }, getBackendDevicesInfo: jest.fn().mockResolvedValue([]) }));

const stats = (over: Record<string, number> = {}) => ({ samples: 38400, seconds: 1.6, peak: 0.6, rms: 0.1, clippedPercent: 0, leadSilenceMs: 100, trailSilenceMs: 200, longestGapMs: 120, bursts: 7, noiseFloorDb: -60, ...over });

function setup(report: Record<string, unknown>) {
  installNativeBoundary({ fs: true });
  const rtl = requireRTL();
  const React = require('react');
  const rn = require('react-native');
  rn.Platform.OS = 'android';
  const native: Record<string, jest.Mock> = {
    activateClonedVoice: jest.fn(async () => 2), installedNeuralVoices: jest.fn(async () => []), setNeuralVoice: jest.fn(async () => 1),
    voiceLab: jest.fn(async () => report), labPlayThroughVoice: jest.fn(async () => true), labPlayWithAndroid: jest.fn(async () => true), labStop: jest.fn(async () => true),
  };
  rn.NativeModules.AtlasTts = native;
  const { useVoiceProfiles } = require('../../../src/atlasVoice/profiles');
  const profile = useVoiceProfiles.getState().addProfile({ name: 'Jake', voiceId: 'pocket-tts-int8', sid: 0, rate: 1, referenceId: 'ref-jake' });
  require('../../../src/atlasVoice/store').useAtlasVoiceStore.getState().setReadVoiceId(profile.id);
  const { VoiceLabScreen } = require('../../../src/screens/VoiceLabScreen');
  return { rtl, native, view: rtl.render(React.createElement(VoiceLabScreen)) };
}

const run = (label: string, steps: number, s = stats(), over: Record<string, unknown> = {}) => ({ label, steps, millis: 1400, audioRate: 24000, engineRate: 24000, path: `/files/voice-lab/${steps}.wav`, stats: s, ...over });
const report = (runs: unknown[], reference = stats({ seconds: 9 })) => ({ referenceRate: 24000, reference, folder: '/files/voice-lab', runs });

it('opens from seven quick taps on the version, and not from fewer', () => {
  installNativeBoundary({ fs: true });
  const rtl = requireRTL();
  const React = require('react');
  const { AboutScreen } = require('../../../src/screens/AboutScreen');
  const view = rtl.render(React.createElement(AboutScreen));
  for (let i = 0; i < 6; i++) rtl.fireEvent.press(view.getByTestId('about-version-tap'));
  expect(mockNavigate).not.toHaveBeenCalled();
  rtl.fireEvent.press(view.getByTestId('about-version-tap'));
  expect(mockNavigate).toHaveBeenCalledWith('VoiceLab');
});

it('loads the cloned voice, runs the chosen steps, shows each run, plays it both ways and flags a stutter', async () => {
  const stutter = stats({ bursts: 19, seconds: 4.8, trailSilenceMs: 1800 });
  const { rtl, native, view } = setup(report([run('steps 2, text tidied', 2), run('steps 5, text tidied', 5, stutter), run('steps 2, text as typed', 2)]));
  rtl.fireEvent.press(view.getByTestId('voice-lab-step-3')); // leave 2 and 5
  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId('voice-lab-run')); });
  await rtl.waitFor(() => expect(view.getByTestId('voice-lab-results')).toBeTruthy());
  expect(native.activateClonedVoice).toHaveBeenCalledWith('pocket-tts-int8', 0, expect.anything(), 'ref-jake', 2);
  expect(native.voiceLab).toHaveBeenCalledWith('Hey man how is it going', [2, 5]);
  expect(view.getByText(/19 bursts/)).toBeTruthy();
  expect(view.getByText(/separate bursts of sound/)).toBeTruthy(); // flagged as stuttering
  expect(view.getByText(/kept going after the words ended/)).toBeTruthy();
  rtl.fireEvent.press(view.getByTestId('voice-lab-play-voice-5'));
  rtl.fireEvent.press(view.getByTestId('voice-lab-play-android-5'));
  expect(native.labPlayThroughVoice).toHaveBeenCalledWith('/files/voice-lab/5.wav');
  expect(native.labPlayWithAndroid).toHaveBeenCalledWith('/files/voice-lab/5.wav');
  rtl.fireEvent.press(view.getByTestId('voice-lab-stop'));
  expect(native.labStop).toHaveBeenCalled();
});

it('says what is wrong with the recording, the sample rate and slow generation, and shows a failed run', async () => {
  const bad = stats({ seconds: 3, clippedPercent: 4, noiseFloorDb: -30 });
  const { rtl, view } = setup(report([run('steps 2, text tidied', 2, stats(), { audioRate: 22050 }), run('steps 3, text tidied', 3, stats(), { millis: 9000 }), { label: 'steps 5, text tidied', steps: 5, millis: 10, audioRate: 0, engineRate: 24000, path: '', error: 'out of memory' }], bad));
  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId('voice-lab-run')); });
  await rtl.waitFor(() => expect(view.getByTestId('voice-lab-results')).toBeTruthy());
  expect(view.getByText(/reference recording is clipped/)).toBeTruthy();
  expect(view.getByText(/reference recording is noisy/)).toBeTruthy();
  expect(view.getByText(/22050 Hz but the engine reports 24000 Hz/)).toBeTruthy();
  expect(view.getByText(/Slower than real time/)).toBeTruthy();
  expect(view.getByText(/Failed: out of memory/)).toBeTruthy();
});

it('says so when the engine cannot run the lab', async () => {
  const { rtl, native, view } = setup(report([]));
  native.voiceLab.mockRejectedValueOnce(new Error('The lab needs a cloned Pocket TTS voice'));
  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId('voice-lab-run')); });
  await rtl.waitFor(() => expect(view.getByTestId('voice-lab-error')).toBeTruthy());
  expect(view.getByText(/cloned Pocket TTS voice/)).toBeTruthy();
});
