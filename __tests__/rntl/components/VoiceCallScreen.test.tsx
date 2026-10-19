import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { AtlasAudioInput, callStatus, formatCallTime } from '../../../src/atlasVoice/AudioInput';
import { useUiModeStore } from '../../../src/stores/uiModeStore';
import { useChatStore } from '../../../src/stores/chatStore';
import { useAgentStore } from '../../../src/stores/agentStore';
import { useAtlasVoiceStore } from '../../../src/atlasVoice/store';

const props = (over: any = {}) => ({
  onStartRecording: jest.fn(), onStopRecording: jest.fn(), onCancelRecording: jest.fn(), onStop: jest.fn(),
  isRecording: false, isTranscribing: false, isModelLoading: false, isGenerating: false,
  voiceAvailable: true, partialResult: '', error: null, disabled: false, ...over,
});

beforeEach(() => {
  jest.useFakeTimers();
  useUiModeStore.setState({ interfaceMode: 'audio' } as any);
  useAtlasVoiceStore.setState({ handsFree: true, speakingKey: null } as any);
  const agentId = useAgentStore.getState().agents[0].id;
  useChatStore.setState({ conversations: [{ id: 'c', agentId, messages: [] } as any], activeConversationId: 'c' });
});
afterEach(() => jest.useRealTimers());

it('looks like a phone call: caller name and a running call timer', () => {
  const screen = render(<AtlasAudioInput {...props()} />);
  expect(screen.getByTestId('voice-call-screen')).toBeTruthy();
  expect(screen.getByText(useAgentStore.getState().agents[0].name)).toBeTruthy();
  expect(screen.getByTestId('voice-call-timer').props.children).toBe('0:00');
  act(() => { jest.advanceTimersByTime(65_000); });
  expect(screen.getByTestId('voice-call-timer').props.children).toBe('1:05');
});

it('starts listening as soon as a hands-free call opens', () => {
  const p = props();
  render(<AtlasAudioInput {...p} />);
  expect(p.onStartRecording).toHaveBeenCalledTimes(1);
});

it('End call stops listening and returns to typing', () => {
  const p = props({ isRecording: true });
  const screen = render(<AtlasAudioInput {...p} />);
  fireEvent.press(screen.getByTestId('voice-call-end'));
  expect(p.onCancelRecording).toHaveBeenCalled();
  expect(useUiModeStore.getState().interfaceMode).toBe('chat');
});

it('Mute stops the current turn and shows Muted', () => {
  const p = props({ isRecording: true });
  const screen = render(<AtlasAudioInput {...p} />);
  fireEvent.press(screen.getByTestId('voice-call-mute'));
  expect(p.onCancelRecording).toHaveBeenCalled();
  expect(screen.getByText('Unmute')).toBeTruthy();
});

describe('call screen helpers', () => {
  it('formats the call timer like a phone', () => {
    expect(formatCallTime(7)).toBe('0:07');
    expect(formatCallTime(3725)).toBe('1:02:05');
  });
  it('shows speaking first, then thinking, listening and muted', () => {
    const base = { handsFree: true, muted: true, speakingKey: null, callerName: 'Coach' };
    expect(callStatus({ ...base, speakingKey: 'k' }).status).toMatch(/Coach is speaking/);
    expect(callStatus({ ...base, isGenerating: true }).icon).toBe('pause');
    expect(callStatus({ ...base, isRecording: true }).status).toBe('Listening...');
    expect(callStatus(base).status).toBe('Muted');
  });
});
