/**
 * Text shared into Atlas: the screen offers what to do with it and each choice opens a new chat with the request typed in.
 * Until the app is ready (or while it is locked behind a PIN) the shared text waits instead of being lost.
 */
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

const mockNav = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn() };
let mockParams: any = {};
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNav,
  useRoute: () => ({ params: mockParams }),
}));

const mockRead = jest.fn();
jest.mock('../../../src/services/documentService', () => ({ documentService: { textFromPicked: (...a: unknown[]) => mockRead(...a) } }));

import { ShareScreen } from '../../../src/share/ShareScreen';
import { flushShare, parseSharedFile, useIncomingShare } from '../../../src/share/shareIntake';
import { useAppStore } from '../../../src/stores/appStore';
import { useAuthStore, useChatStore } from '../../../src/stores';
import { createDownloadedModel } from '../../utils/factories';

beforeEach(() => { mockNav.replace.mockClear(); useIncomingShare.setState({ text: null }); });

it('opens a chat with the shared text and the chosen request typed in', () => {
  useAppStore.setState({ downloadedModels: [createDownloadedModel({ id: 'm1' })], activeModelId: 'm1' });
  mockParams = { text: 'https://example.com/long-article' };
  const screen = render(<ShareScreen />);
  expect(screen.getByTestId('share-preview').props.children).toBe('https://example.com/long-article');
  const before = useChatStore.getState().conversations.length;
  fireEvent.press(screen.getByTestId('share-summarize'));
  expect(useChatStore.getState().conversations.length).toBe(before + 1);
  expect(mockNav.replace).toHaveBeenCalledWith('Chat', expect.objectContaining({ starter: 'Summarize this:\n\nhttps://example.com/long-article' }));
});

it('cuts very long text, and says so when no model is downloaded', () => {
  const { Alert } = require('react-native');
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  useAppStore.setState({ downloadedModels: [], activeModelId: null });
  mockParams = { text: 'a'.repeat(9000) };
  const screen = render(<ShareScreen />);
  expect(String(screen.getByTestId('share-preview').props.children).length).toBe(6003);
  fireEvent.press(screen.getByTestId('share-ask'));
  expect(alert).toHaveBeenCalledWith('No model yet', expect.any(String));
  expect(mockNav.replace).not.toHaveBeenCalled();
  alert.mockRestore();
});

it('keeps shared text waiting until the navigation is ready', () => {
  useIncomingShare.getState().set('hello from another app');
  flushShare(); // no navigation container yet in this test
  expect(useIncomingShare.getState().text).toBe('hello from another app');
  expect(useAuthStore).toBeDefined();
});

it('opens a shared PDF: shows what it says, offers to ask about the whole document, and saves the text to the journal', async () => {
  const { waitFor } = require('@testing-library/react-native');
  const { useJournal, dayKey } = require('../../../src/journal/store');
  useAppStore.setState({ downloadedModels: [createDownloadedModel({ id: 'm1' })], activeModelId: 'm1' });
  useJournal.setState({ entries: [] });
  mockRead.mockResolvedValueOnce('The lease ends on 1 March and the deposit is 900 dollars.');
  mockParams = { file: { uri: 'content://docs/1', mime: 'application/pdf' } };
  const screen = render(<ShareScreen />);
  await waitFor(() => expect(screen.getByTestId('share-preview').props.children).toMatch(/The lease ends on 1 March/));
  expect(mockRead).toHaveBeenCalledWith('content://docs/1', 'shared.pdf', 6000);

  fireEvent.press(screen.getByTestId('share-summarize'));
  expect(mockNav.replace).toHaveBeenCalledWith('Chat', expect.objectContaining({ starter: expect.stringMatching(/^Summarize this:\n\nThe lease ends on 1 March/) }));
  fireEvent.press(screen.getByTestId('share-ask-document'));
  expect(mockNav.replace).toHaveBeenCalledWith('AskDocument', { file: mockParams.file });
  fireEvent.press(screen.getByTestId('share-journal'));
  expect(useJournal.getState().entries[0]).toMatchObject({ day: dayKey(), text: 'The lease ends on 1 March and the deposit is 900 dollars.' });
});

it('offers a shared picture to the translator, says plainly when a file has no text, and reads the native report of a shared file', async () => {
  const { waitFor } = require('@testing-library/react-native');
  mockParams = { file: { uri: 'content://photos/2', mime: 'image/jpeg' } };
  let screen = render(<ShareScreen />);
  fireEvent.press(screen.getByTestId('share-translate-picture'));
  expect(mockNav.replace).toHaveBeenCalledWith('Translator', { picture: mockParams.file });
  expect(screen.queryByTestId('share-summarize')).toBeNull(); // no text to work on in a picture
  screen.unmount();

  mockRead.mockRejectedValueOnce(new Error('This PDF is scanned and has no text.'));
  mockParams = { file: { uri: 'content://docs/3', mime: 'application/pdf' } };
  screen = render(<ShareScreen />);
  await waitFor(() => expect(screen.getByTestId('share-preview').props.children).toMatch(/scanned and has no text/));
  expect(screen.queryByTestId('share-summarize')).toBeNull();

  expect(parseSharedFile('{"uri":"content://a/1","mime":"image/png"}')).toEqual({ uri: 'content://a/1', mime: 'image/png' });
  expect(parseSharedFile('{"mime":"image/png"}')).toBeNull();
  expect(parseSharedFile('not json')).toBeNull();
  expect(parseSharedFile(null)).toBeNull();
});
