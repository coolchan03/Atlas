import React from 'react';
import { act, render, fireEvent } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { installProtectedDataBoundary } from '../../harness/protectedDataBoundary';
import { installBackupRestoreBoundary } from '../../harness/backupRestoreBoundary';

const mockRoute = { params: { projectId: 'restore-project' } };
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useRoute: () => mockRoute,
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), addListener: () => () => undefined }),
  useFocusEffect: jest.fn(),
  useIsFocused: () => true,
}));

const PIN = '123456';
const PASSWORD = 'synthetic backup password';
const CHAT_KEY = 'local-llm-chat-storage';
const PROJECT_KEY = 'local-llm-project-storage';
const stored = (state: object) => JSON.stringify({ state, version: 0 });

it('restores over open protected records without encrypting placeholders and keeps protected items absent from the file', async () => {
  const boundary = installBackupRestoreBoundary();
  const crypto = installProtectedDataBoundary();
  const fixture = async (id: string, name: string, reply: string, portable = false) => {
    const project = { id, name, description: '', systemPrompt: 'Synthetic project instructions',
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-10-22T00:00:00.000Z' };
    const chat = { id: `${id}-chat`, projectId: id, title: `${name} chat`, modelId: 'synthetic-model',
      createdAt: project.createdAt, updatedAt: project.updatedAt,
      messages: [{ id: `${id}-message`, role: 'assistant', content: reply, timestamp: project.updatedAt }] };
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
  const replaced = await fixture('restore-project', 'Earlier project', 'Earlier reply');
  const retained = await fixture('retained-project', 'Retained project', 'Retained reply');
  const incoming = await fixture('restore-project', 'Restored project', 'Restored encrypted reply', true);
  await AsyncStorage.setItem(PROJECT_KEY, stored({ projects: [replaced.project, retained.project] }));
  await AsyncStorage.setItem(CHAT_KEY, stored({ conversations: [replaced.chat, retained.chat], activeConversationId: null }));
  const backup = {
    format: 'OffGridAtlasBackup', version: 1,
    items: {
      [PROJECT_KEY]: stored({ projects: [incoming.project] }),
      [CHAT_KEY]: stored({ conversations: [incoming.chat], activeConversationId: null }),
    },
  };
  const selectBackup = async (extra: object = {}) => boundary.selectBackup(
    await crypto.device.encryptPortableBackup(JSON.stringify({ ...backup, ...extra }), PASSWORD),
  );
  await selectBackup();

  const { useProjectStore } = require('../../../src/stores/projectStore');
  const { useChatStore } = require('../../../src/stores/chatStore');
  const { encryptedChatStorage, relockProtectedChats } = require('../../../src/stores/encryptedChatStorage');
  const { protectedProjectStorage, relockProjects } = require('../../../src/stores/protectedProjectStorage');
  const { SettingsScreen } = require('../../../src/screens/SettingsScreen');
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
    showProject('restore-project');
    await unlock();
    expect(screen!.getByText('Earlier reply')).toBeTruthy();
    showProject('retained-project');
    await unlock();
    await act(async () => {
      useProjectStore.getState().updateProject('retained-project', { name: 'Retained local edit' });
      useChatStore.getState().updateMessageContent('retained-project-chat', 'retained-project-message', 'Retained edited reply');
    });

    screen!.unmount();
    screen = render(<SettingsScreen />);
    fireEvent.press(screen.getByText('Restore encrypted backup'));
    await act(async () => { await boundary.pressAlertButton('Choose file'); });
    fireEvent.changeText(screen.getByPlaceholderText('Backup password'), PASSWORD);
    const document = { projectId: 'restore-project', name: 'note.txt', size: 3,
      enabled: true, createdAt: '2026-01-01', base64: 'YWJj', chunks: [{ content: 'abc', position: 0 }] };
    await selectBackup({ version: 2, projectFiles: [document] });
    for (const pendingReply of ['isStreaming', 'isThinking']) {
      const writesBefore = boundary.fileWrites.mock.calls.length;
      await act(async () => { useChatStore.setState({ [pendingReply]: true }); });
      await act(async () => { await fireEvent.press(screen!.getByText('Continue')); });
      expect(boundary.alerts[boundary.alerts.length - 1]).toMatchObject({
        title: 'Encrypted backup failed', message: 'Finish or stop the current reply before restoring a backup.',
      });
      expect(boundary.fileWrites.mock.calls.length).toBe(writesBefore);
      expect(useProjectStore.getState().getProject('restore-project').name).toBe('Earlier project');
      expect(useChatStore.getState().conversations.find((c: { id: string }) => c.id === 'restore-project-chat').messages[0].content)
        .toBe('Earlier reply');
      await act(async () => { useChatStore.setState({ [pendingReply]: false }); });
    }
    await selectBackup({ version: 2, projectFiles: [{ ...document, name: '../invalid.txt' }] });
    const beforeInvalid = await AsyncStorage.multiGet([PROJECT_KEY, CHAT_KEY]);
    const writesBeforeInvalid = boundary.fileWrites.mock.calls.length;
    await act(async () => { await fireEvent.press(screen!.getByText('Continue')); });
    expect(boundary.alerts[boundary.alerts.length - 1]).toMatchObject({
      title: 'Encrypted backup failed', message: expect.stringMatching(/Invalid project document/),
    });
    expect(boundary.fileWrites.mock.calls.length).toBe(writesBeforeInvalid);
    expect(await AsyncStorage.multiGet([PROJECT_KEY, CHAT_KEY])).toEqual(beforeInvalid);
    expect(useProjectStore.getState().getProject('restore-project').name).toBe('Earlier project');

    await selectBackup();
    await act(async () => { await fireEvent.press(screen!.getByText('Continue')); });
    expect(boundary.alerts.map(item => item.title)).toContain('Encrypted backup restored');

    // Restored ciphertext must open as its own record, even though the previous copy was open.
    const saved = JSON.parse((await encryptedChatStorage.getItem(CHAT_KEY))!);
    const restoredChat = saved.state.conversations.find((c: { id: string }) => c.id === 'restore-project-chat');
    const body = restoredChat.protectedBlob.startsWith('atlasbackup:')
      ? await crypto.device.decryptPortableBackup(restoredChat.protectedBlob, `${PIN}:atlas-locked-chat:restore-project-chat`)
      : await crypto.device.decryptProtectedItem('chat', restoredChat.id, restoredChat.protectedBlob, PIN, restoredChat.pinVerifier);
    expect(JSON.parse(body).messages.map((m: { content: string }) => m.content)).toContain('Restored encrypted reply');
    showProject('restore-project');
    await unlock();
    expect(screen!.getByText('Restored project')).toBeTruthy();
    expect(screen!.getByText('Restored encrypted reply')).toBeTruthy();
    showProject('retained-project');
    await unlock();
    expect(screen!.getByText('Retained local edit')).toBeTruthy();
    expect(screen!.getByText('Retained edited reply')).toBeTruthy();

    await act(async () => { await relockProjects(); await relockProtectedChats(); });
    screen!.unmount();
    await useProjectStore.persist.rehydrate();
    await useChatStore.persist.rehydrate();
    showProject('restore-project');
    await unlock();
    expect(screen!.getByText('Restored encrypted reply')).toBeTruthy();
    const disk = (await protectedProjectStorage.getItem(PROJECT_KEY))! + (await encryptedChatStorage.getItem(CHAT_KEY))!;
    expect(disk).not.toContain('Restored encrypted reply');
    expect(disk).not.toContain('Retained edited reply');
  } finally {
    screen?.unmount();
    useChatStore.setState({ isStreaming: false, isThinking: false });
    await relockProjects();
    await relockProtectedChats();
    crypto.restore();
    boundary.restore();
  }
});

it('requires replacement confirmation before encrypted restore and lets cancellation leave data alone', async () => {
  const boundary = installBackupRestoreBoundary();
  const { SettingsScreen } = require('../../../src/screens/SettingsScreen');
  const before = await AsyncStorage.getItem(CHAT_KEY);
  const screen = render(<SettingsScreen />);
  try {
    fireEvent.press(screen.getByText('Restore encrypted backup'));
    expect(boundary.alerts[boundary.alerts.length - 1]).toMatchObject({
      title: 'Restore backup?',
      message: 'This replaces your current agents, projects, chats and settings with the ones in the backup file.',
    });
    expect(screen.queryByPlaceholderText('Backup password')).toBeNull();
    expect(boundary.pick).not.toHaveBeenCalled();
    await act(async () => { await boundary.pressAlertButton('Cancel'); });
    expect(screen.queryByPlaceholderText('Backup password')).toBeNull();
    expect(await AsyncStorage.getItem(CHAT_KEY)).toBe(before);
    expect(boundary.pick).not.toHaveBeenCalled();

    fireEvent.press(screen.getByText('Restore encrypted backup'));
    await act(async () => { await boundary.pressAlertButton('Choose file'); });
    expect(screen.getByPlaceholderText('Backup password')).toBeTruthy();
  } finally {
    screen.unmount();
    boundary.restore();
  }
});
