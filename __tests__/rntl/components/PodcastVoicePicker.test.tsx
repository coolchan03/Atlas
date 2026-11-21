/**
 * Choosing the podcast and briefing voices: three voices to start with, "Add voice" for any other voice including saved and
 * cloned ones, each host gets the voice tapped, and the players use it (hostVoices). Fakes only the device boundary (the voice engine).
 */
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

const mockSpoken: string[] = [];
jest.mock('../../../src/atlasVoice/tts', () => ({
  listVoices: jest.fn(async () => Array.from({ length: 11 }, (_, i) => ({ name: `sid:${i}`, locale: 'en-US', quality: 500 }))),
  speakAndWait: jest.fn(async (_t: string, opts: { voice: string }) => { mockSpoken.push(opts.voice); return true; }),
  speak: jest.fn(),
  stop: jest.fn(),
}));
jest.mock('../../../src/atlasVoice/neural', () => ({
  ...jest.requireActual('../../../src/atlasVoice/neural'),
  loadVoiceForSpeech: jest.fn(async () => undefined),
  restoreSavedVoice: jest.fn(async () => undefined),
}));

import { PodcastVoicePicker } from '../../../src/components/PodcastVoicePicker';
import { useAtlasVoiceStore } from '../../../src/atlasVoice/store';
import { useVoiceProfiles } from '../../../src/atlasVoice/profiles';
import { defaultHostVoices, hostVoices } from '../../../src/atlasVoice/neural';

const voices = Array.from({ length: 11 }, (_, i) => ({ name: `sid:${i}` }));
const reset = () => {
  mockSpoken.length = 0;
  useAtlasVoiceStore.setState({ neuralVoice: 'kokoro-en', neuralSid: 0, podcastVoices: [], podcastExtraVoices: [] });
  useVoiceProfiles.setState({ profiles: [] });
};

it('starts with three voices per host, not every voice on the phone', async () => {
  reset();
  const screen = render(<PodcastVoicePicker hosts={2} />);
  expect(await screen.findByLabelText('Host A (anchor): Default (US)')).toBeTruthy();
  expect(screen.getByLabelText('Host A (anchor): Adam (US)')).toBeTruthy();
  expect(screen.getByLabelText('Host A (anchor): Emma (UK)')).toBeTruthy();
  expect(screen.queryByLabelText('Host A (anchor): George (UK)')).toBeNull();
  expect(screen.getAllByText('Add voice')).toHaveLength(2);
});

it('adds another voice for a host, picks it, keeps it, and uses it in the players', async () => {
  reset();
  const screen = render(<PodcastVoicePicker hosts={2} />);
  fireEvent.press(await screen.findByTestId('add-voice-1'));
  fireEvent.press(screen.getByLabelText('Add George (UK)'));
  expect(screen.getByLabelText('Host B: George (UK)').props.accessibilityState.selected).toBe(true);
  await waitFor(() => expect(mockSpoken).toEqual(['sid:9']));
  expect(hostVoices(voices)[1]).toBe('sid:9');
  expect(useAtlasVoiceStore.getState().podcastExtraVoices).toEqual(['sid:9']);
  // The added voice is now one of the choices for the other host too, and can be taken away again.
  expect(screen.getByLabelText('Host A (anchor): George (UK)')).toBeTruthy();
  // A voice that is not picked on this row can be taken off the list (it stays while another host uses it).
  fireEvent.press(screen.getAllByTestId('voice-remove-sid:9')[0]);
  expect(useAtlasVoiceStore.getState().podcastExtraVoices).toEqual([]);
  expect(screen.getByLabelText('Host B: George (UK)')).toBeTruthy();
  fireEvent.press(await screen.findByText('Use the three automatic voices'));
  expect(hostVoices(voices)[1]).not.toBe('sid:9');
});

it('offers saved and cloned voices first, and a cloned voice can be a host', async () => {
  reset();
  const clone = useVoiceProfiles.getState().addProfile({ name: 'Mom', voiceId: 'sherpa-onnx-pocket-tts-int8', sid: 0, rate: 1, referenceId: 'ref-1' });
  const screen = render(<PodcastVoicePicker hosts={3} />);
  fireEvent.press(await screen.findByTestId('add-voice-2'));
  fireEvent.press(screen.getByLabelText('Add Mom (cloned)'));
  const key = `profile:${clone.id}`;
  await waitFor(() => expect(useAtlasVoiceStore.getState().podcastVoices[2]).toBe(key));
  expect(screen.getByLabelText('Host C: Mom (cloned)').props.accessibilityState.selected).toBe(true);
  expect(hostVoices(voices)[2]).toBe(key);
});

it('a host whose saved voice was deleted goes back to the automatic voice', async () => {
  reset();
  const profile = useVoiceProfiles.getState().addProfile({ name: 'Mom', voiceId: 'x', sid: 0, rate: 1 });
  useAtlasVoiceStore.setState({ podcastVoices: ['', '', `profile:${profile.id}`] });
  expect(hostVoices(voices)[2]).toBe(`profile:${profile.id}`);
  useVoiceProfiles.getState().removeProfile(profile.id);
  expect(hostVoices(voices)[2]).toBe(defaultHostVoices(voices)[2]);
});
