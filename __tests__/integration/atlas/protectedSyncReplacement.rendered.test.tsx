import React from 'react';
import { act, render, fireEvent, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { installNearbySyncBoundary } from '../../harness/nearbySyncBoundary';
import { installProtectedDataBoundary } from '../../harness/protectedDataBoundary';

const mockRoute = { params: { projectId: 'open-project' } };
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useRoute: () => mockRoute,
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), addListener: () => () => undefined }),
  useFocusEffect: jest.fn(),
  useIsFocused: () => true,
}));

const PIN = '123456';
const CHAT_KEY = 'local-llm-chat-storage';
const PROJECT_KEY = 'local-llm-project-storage';
const stored = (state: object) => JSON.stringify({ state, version: 0 });

it('opens received locked content after sync and reload while preserving open local edits', async () => {
  const peer = installNearbySyncBoundary();
  const crypto = installProtectedDataBoundary();
  const fixture = async (id: string, name: string, reply: string, updatedAt: string, portable = false) => {
    const project = { id, name, description: '', systemPrompt: 'Synthetic project instructions',
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt };
    const chat = { id: `${id}-chat`, projectId: id, title: `${name} chat`, modelId: 'synthetic-model',
      createdAt: project.createdAt, updatedAt,
      messages: [{ id: `${id}-message`, role: 'assistant', content: reply, timestamp: updatedAt }] };
    const pinVerifier = await crypto.device.createChatPinVerifier(PIN);
    const projectBlob = portable
      ? await crypto.device.encryptPortableBackup(JSON.stringify({ v: 1, project, docs: [], study: [] }), `${PIN}:atlas-protected-project:${id}`)
      : await crypto.device.encryptProtectedItem('project', id, JSON.stringify(project), PIN, pinVerifier);
    const chatBlob = portable
      ? await crypto.device.encryptPortableBackup(JSON.stringify(chat), `${PIN}:atlas-locked-chat:${chat.id}`)
      : await crypto.device.encryptProtectedItem('chat', chat.id, JSON.stringify(chat), PIN, pinVerifier);
    return {
      project: { ...project, name: 'Locked project', systemPrompt: '', pinVerifier, protectedBlob: projectBlob },
      chat: { ...chat, title: 'Locked conversation', messages: [], pinVerifier, protectedBlob: chatBlob },
    };
  };
  const before = new Date(Date.now() - 60_000).toISOString();
  const oldClosed = await fixture('closed-project', 'Older closed project', 'Older closed reply', before);
  const oldOpen = await fixture('open-project', 'Open local project', 'Original open reply', before);
  await AsyncStorage.setItem(PROJECT_KEY, stored({ projects: [oldClosed.project, oldOpen.project] }));
  await AsyncStorage.setItem(CHAT_KEY, stored({ conversations: [oldClosed.chat, oldOpen.chat], activeConversationId: null }));

  const { useProjectStore } = require('../../../src/stores/projectStore');
  const { useChatStore } = require('../../../src/stores/chatStore');
  const { encryptedChatStorage, relockProtectedChats } = require('../../../src/stores/encryptedChatStorage');
  const { protectedProjectStorage, relockProjects } = require('../../../src/stores/protectedProjectStorage');
  const { nearbySync } = require('../../../src/services/nearbySync');
  const { NearbySyncSettings } = require('../../../src/components/settings/NearbySyncSettings');
  const { ProjectDetailScreen } = require('../../../src/screens/ProjectDetailScreen');
  let screen: ReturnType<typeof render> | undefined;
  const showProject = (id: string) => {
    screen?.unmount();
    mockRoute.params.projectId = id;
    screen = render(<ProjectDetailScreen />);
  };
  const unlock = async () => {
    fireEvent.changeText(screen!.getByPlaceholderText('4–12 digit PIN'), PIN);
    await act(async () => { await fireEvent.press(screen!.getByText('Unlock project')); });
    expect(screen!.queryByPlaceholderText('4–12 digit PIN')).toBeNull();
  };

  try {
    await useProjectStore.persist.rehydrate();
    await useChatStore.persist.rehydrate();
    await nearbySync.init();
    showProject('open-project');
    await unlock();
    await screen!.findByText('Original open reply');
    await act(async () => {
      useProjectStore.getState().updateProject('open-project', { name: 'Locally edited project' });
      useChatStore.getState().updateMessageContent('open-project-chat', 'open-project-message', 'Locally edited reply');
    });
    expect(screen!.getByText('Locally edited project')).toBeTruthy();
    expect(screen!.getByText('Locally edited reply')).toBeTruthy();

    screen!.unmount();
    screen = render(<NearbySyncSettings />);
    fireEvent(screen.getByTestId('nearby-sync-toggle'), 'valueChange', true);
    fireEvent.changeText(await screen.findByTestId('nearby-pair-link'), 'atlas://sync?id=peer1234&key=synthetic');
    await waitFor(() => expect(screen!.getByTestId('nearby-join-button')).toBeEnabled());
    fireEvent.press(screen.getByTestId('nearby-join-button'));
    await screen.findByTestId('sync-peer1234');
    await waitFor(() => expect(screen!.getByTestId('sync-peer1234')).toBeEnabled());

    const after = new Date(Date.now() + 60_000).toISOString();
    const incoming = await fixture('closed-project', 'Received project', 'Received encrypted reply', after, true);
    const conflict = await fixture('open-project', 'Remote project conflict', 'Remote reply conflict', after, true);
    peer.setSnapshot({ projects: [incoming.project, conflict.project], conversations: [incoming.chat, conflict.chat] });
    fireEvent.press(screen.getByTestId('sync-peer1234'));
    await waitFor(() => expect(screen!.getByTestId('sync-peer1234')).toBeEnabled());
    expect(screen.queryByText(/Last issue:/)).toBeNull();

    // Reads wait for the real queued writes. Closed incoming blobs must survive both adapters.
    const savedProjects = JSON.parse(await protectedProjectStorage.getItem(PROJECT_KEY));
    const savedChats = JSON.parse(await encryptedChatStorage.getItem(CHAT_KEY));
    expect(savedProjects.state.projects.find((p: { id: string }) => p.id === 'closed-project').protectedBlob)
      .toBe(incoming.project.protectedBlob);
    expect(savedChats.state.conversations.find((c: { id: string }) => c.id === 'closed-project-chat').protectedBlob)
      .toBe(incoming.chat.protectedBlob);

    showProject('open-project');
    expect(screen!.getByText('Locally edited project')).toBeTruthy();
    expect(screen!.getByText('Locally edited reply')).toBeTruthy();
    expect(screen!.queryByText('Remote reply conflict')).toBeNull();
    showProject('closed-project');
    await unlock();
    await screen!.findByText('Received project');
    await screen!.findByText('Received encrypted reply');

    // Re-lock, reload from storage, and authenticate again: both accepted data and local edits persist.
    await act(async () => { await relockProjects(); await relockProtectedChats(); });
    screen!.unmount();
    await useProjectStore.persist.rehydrate();
    await useChatStore.persist.rehydrate();
    showProject('closed-project');
    await unlock();
    await screen!.findByText('Received project');
    await screen!.findByText('Received encrypted reply');
    showProject('open-project');
    await unlock();
    await screen!.findByText('Locally edited project');
    await screen!.findByText('Locally edited reply');

    const disk = (await AsyncStorage.getItem(PROJECT_KEY))! + (await AsyncStorage.getItem(CHAT_KEY))!;
    expect(disk).not.toContain('Received project');
    expect(disk).not.toContain('Received encrypted reply');
    expect(disk).not.toContain('Locally edited reply');
  } finally {
    screen?.unmount();
    await nearbySync.setEnabled(false);
    crypto.restore();
    peer.restore();
  }
});
