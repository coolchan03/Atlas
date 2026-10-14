import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { act, fireEvent, render, within } from '@testing-library/react-native';
import { registerSlot, SLOTS } from '../../../src/bootstrap/slotRegistry';
import { ChatHeader } from '../../../src/screens/ChatScreen/ChatScreenComponents';

jest.mock('react-native-spotlight-tour', () => ({
  AttachStep: ({ children }: any) => children,
}));
jest.mock('../../../src/components', () => ({
  ModelSelectorModal: () => null,
}));

const styles = Object.fromEntries([
  'header', 'headerRow', 'backButton', 'headerLeft', 'headerTitle', 'headerSubtitleRow',
  'modelSelector', 'headerSubtitle', 'modelSelectorArrow', 'remoteIcon',
  'headerActions', 'iconButton', 'modeToggleWrap',
].map(key => [key, {}])) as any;

const colors = {
  text: '#ffffff', textMuted: '#777777', textSecondary: '#aaaaaa',
  primary: '#00aaff', success: '#22bb55',
} as any;

describe('Chat header actions', () => {
  it('keeps the phone call and chat settings together, not alongside the model name', () => {
    registerSlot(SLOTS.chatInputModeToggle, () => (
      <TouchableOpacity testID="chat-voice-mode-button" accessibilityLabel="Voice mode">
        <Text>Call</Text>
      </TouchableOpacity>
    ));
    const onSettings = jest.fn();
    const view = render(
      <ChatHeader styles={styles} colors={colors} activeConversation={{ title: 'Chat' }}
        activeProject={null} navigation={{ goBack: jest.fn() }} onOpenModels={jest.fn()}
        setShowSettingsPanel={onSettings} setShowProjectSelector={jest.fn()} />,
    );
    const actions = view.getByTestId('chat-header-actions');
    expect(within(actions).getByTestId('chat-voice-mode-button')).toBeTruthy();
    expect(within(actions).getByTestId('chat-settings-icon')).toBeTruthy();
    expect(view.queryByTestId('deep-research-toggle')).toBeNull();
    fireEvent.press(view.getByTestId('chat-settings-icon'));
    expect(onSettings).toHaveBeenCalledWith(true);

    // A TTS backend can register after chat has opened. The phone action still appears.
    act(() => registerSlot(SLOTS.chatInputModeToggle, () => (
      <TouchableOpacity testID="chat-voice-mode-late"><Text>Updated call</Text></TouchableOpacity>
    )));
    expect(within(actions).getByTestId('chat-voice-mode-late')).toBeTruthy();
  });
});
