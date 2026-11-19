import React from 'react';
import { render } from '@testing-library/react-native';
import { ChatHeader } from '../../src/screens/ChatScreen/ChatScreenComponents';

jest.mock('react-native-spotlight-tour', () => ({ AttachStep: ({ children }: any) => children }));
jest.mock('../../src/screens/ChatScreen/HeaderVoiceAction', () => ({ HeaderVoiceAction: () => null }), { virtual: true });

const colors: any = { text: '#000', textMuted: '#777', textSecondary: '#555', primary: '#06c', background: '#fff', success: '#0a0' };
const base = { styles: new Proxy({}, { get: () => ({}) }) as any, colors, navigation: { goBack: jest.fn() }, onOpenModels: jest.fn(), setShowSettingsPanel: jest.fn(), setShowProjectSelector: jest.fn(), activeProject: null };

describe('incognito chats are unmistakable', () => {
  it('shows a persistent "Incognito · not saved" band for a private chat', () => {
    const { getByTestId, getByText } = render(<ChatHeader {...base} activeConversation={{ isPrivate: true, title: 'x' }} />);
    expect(getByTestId('incognito-banner')).toBeTruthy();
    expect(getByText('Incognito · not saved')).toBeTruthy();
  });
  it('says a remote model still receives the messages', () => {
    const { getByText } = render(<ChatHeader {...base} isRemote activeConversation={{ isPrivate: true }} />);
    expect(getByText('Remote model still receives your messages')).toBeTruthy();
  });
  it('is not shown for an ordinary chat', () => {
    const { queryByTestId } = render(<ChatHeader {...base} activeConversation={{ isPrivate: false, title: 'Hello' }} />);
    expect(queryByTestId('incognito-banner')).toBeNull();
  });
});
