import { installNativeBoundary } from '../harness/nativeBoundary';

type Tools = typeof import('../../src/atlasTools/deviceTools');
const native: Record<string, jest.Mock> = {};
const load = (opts: { allFiles?: boolean } = {}): { tools: Tools; RNFS: any; Alert: any } => {
  jest.resetModules();
  installNativeBoundary({ fs: true });
  const rn = require('react-native');
  for (const k of ['hasAllFilesAccess', 'requestAllFilesAccess', 'storageRoot', 'openFile', 'calendarEvents', 'addCalendarEvent', 'addRepeatingCalendarEvent']) native[k] = jest.fn();
  native.hasAllFilesAccess.mockResolvedValue(!!opts.allFiles);
  native.storageRoot.mockResolvedValue('/storage/emulated/0');
  native.calendarEvents.mockResolvedValue([]);
  rn.NativeModules.AtlasDevice = native;
  const RNFS = require('react-native-fs');
  RNFS.ExternalDirectoryPath = '/storage/emulated/0/Android/data/app/files';
  RNFS.DocumentDirectoryPath = RNFS.DocumentDirectoryPath || '/data/app/files';
  return { tools: require('../../src/atlasTools/deviceTools'), RNFS, Alert: rn.Alert };
};
const answer = (Alert: any, text: string | null) => jest.spyOn(Alert, 'alert').mockImplementation(((_t: string, _m: string, buttons: any[]) => { const b = buttons.find((x) => x.text === text); if (b) b.onPress(); else buttons[0].onPress(); }) as never);

describe('device tools: the workspace and what may be reached', () => {
  it('uses the app folder by default and the shared Documents/Atlas folder with all-files access', async () => {
    let t = load(); expect(await t.tools.hasAllFiles()).toBe(false);
    expect(await t.tools.workspaceDir()).toMatch(/Workspace$/);
    t = load({ allFiles: true }); expect(await t.tools.workspaceDir()).toBe('/storage/emulated/0/Documents/Atlas');
    await t.tools.requestAllFiles(); expect(native.requestAllFilesAccess).toHaveBeenCalled();
    native.hasAllFilesAccess.mockRejectedValue(new Error('x')); expect(await t.tools.hasAllFiles()).toBe(false);
  });
  it('refuses paths that escape, are encoded, or lie outside allowed storage', async () => {
    const { tools } = load();
    for (const bad of ['../x', 'a/../../b', '%2e%2e/x', 'a\\b', '/etc/passwd', '/data/other/file.txt']) await expect(tools.listFiles(bad)).rejects.toThrow();
    await expect(tools.listFiles('%E0%A4%A')).rejects.toThrow(/Invalid path/);
    await expect(tools.listFiles('/data/other')).rejects.toThrow(/All files access/);
    const full = load({ allFiles: true }); await expect(full.tools.listFiles('/data/other')).rejects.toThrow(/Outside allowed storage/);
  });
});

describe('device tools: files', () => {
  it('lists folders first, and says when a folder is missing or empty', async () => {
    const { tools, RNFS } = load();
    const ws = await tools.workspaceDir();
    expect(await tools.listFiles()).toMatch(/is empty/);
    await RNFS.mkdir(`${ws}/sub`); await RNFS.writeFile(`${ws}/b.txt`, 'hello world', 'utf8'); await RNFS.writeFile(`${ws}/a.txt`, 'x'.repeat(2_500_000), 'utf8');
    const out = await tools.listFiles('.');
    expect(out.indexOf('[folder] sub/')).toBeLessThan(out.indexOf('a.txt')); expect(out).toMatch(/MB/); expect(out).toMatch(/KB/);
    expect(await tools.listFiles('nothing-here')).toMatch(/Folder not found/);
  });
  it('reads text in pages and refuses files it cannot read', async () => {
    const { tools, RNFS } = load();
    const ws = await tools.workspaceDir();
    await RNFS.writeFile(`${ws}/long.txt`, 'abcdefghij'.repeat(5000), 'utf8');
    const first = await tools.readFile('long.txt');
    expect(first).toMatch(/Showing characters 0-\d+ of 50000/);
    const offset = Number(first.match(/offset=(\d+)/)![1]);
    expect(await tools.readFile('long.txt', offset)).toMatch(new RegExp(`Showing characters ${offset}-`));
    await RNFS.writeFile(`${ws}/short.md`, 'tiny', 'utf8');
    expect(await tools.readFile('short.md')).toBe('tiny');
    expect(await tools.readFile('missing.txt')).toMatch(/File not found/);
    await RNFS.writeFile(`${ws}/photo.png`, 'x', 'utf8');
    expect(await tools.readFile('photo.png')).toMatch(/Could not read this file/);
    expect(tools.lastFileRead).toBeGreaterThanOrEqual(0);
  });
  it('writes only after the person agrees, and says so when they decline', async () => {
    const { tools, RNFS, Alert } = load();
    const ws = await tools.workspaceDir();
    answer(Alert, 'Deny');
    expect(await tools.writeFile('notes.txt', 'draft')).toMatch(/declined/); expect(await RNFS.exists(`${ws}/notes.txt`)).toBe(false);
    jest.restoreAllMocks(); answer(Alert, 'Create');
    expect(await tools.writeFile('notes.txt', 'draft')).toMatch(/Saved .*notes.txt \(5 characters\)/);
    jest.restoreAllMocks(); answer(Alert, 'Add');
    await tools.writeFile('notes.txt', ' more', true);
    expect(await RNFS.readFile(`${ws}/notes.txt`, 'utf8')).toBe('draft more');
    jest.restoreAllMocks(); answer(Alert, 'Replace');
    await tools.writeFile('notes.txt', 'y'.repeat(500));
    expect((await RNFS.readFile(`${ws}/notes.txt`, 'utf8')).length).toBe(500);
  });
  it('an unanswered question counts as no', async () => {
    jest.useFakeTimers();
    const { tools, Alert } = load();
    jest.spyOn(Alert, 'alert').mockImplementation((() => undefined) as never);
    const pending = tools.confirm('Title', 'Message');
    jest.advanceTimersByTime(tools.CONFIRM_TIMEOUT_MS + 1);
    expect(await pending).toBe(false);
    jest.useRealTimers();
  });
  it('makes a web page, previews it, and opens files', async () => {
    const { tools, RNFS, Alert } = load();
    const ws = await tools.workspaceDir();
    answer(Alert, 'Create');
    const res = await tools.createWebPage('My Site!', '<p>Hello</p>');
    expect(res).toMatch(/Opened it for preview/); expect(native.openFile).toHaveBeenCalledWith(`${ws}/Sites/my-site/index.html`);
    expect(await RNFS.readFile(`${ws}/Sites/my-site/index.html`, 'utf8')).toMatch(/<!doctype html>.*<title>My Site!<\/title>/);
    await tools.createWebPage('Full', '<html><body>whole</body></html>');
    expect(await RNFS.readFile(`${ws}/Sites/full/index.html`, 'utf8')).toBe('<html><body>whole</body></html>');
    native.openFile.mockRejectedValueOnce(new Error('no viewer'));
    expect(await tools.createWebPage('', '<p>x</p>')).toMatch(/Path:/);
    jest.restoreAllMocks(); answer(Alert, 'Deny');
    expect(await tools.createWebPage('No', '<p>x</p>')).toMatch(/declined/);
    expect(await tools.openFile('Sites/my-site/index.html')).toMatch(/Opened/);
    expect(await tools.openFile('nope.html')).toMatch(/File not found/);
  });
});

describe('device tools: calendar, drafts and memory', () => {
  it('reads calendar events only with permission', async () => {
    const { tools } = load();
    const { PermissionsAndroid } = require('react-native');
    jest.spyOn(PermissionsAndroid, 'request').mockResolvedValueOnce('denied');
    expect(await tools.calendarEvents()).toMatch(/not granted/);
    jest.spyOn(PermissionsAndroid, 'request').mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED);
    expect(await tools.calendarEvents(3, 1)).toMatch(/No events/);
    native.calendarEvents.mockResolvedValue([{ begin: Date.UTC(2026, 10, 14, 15), end: Date.UTC(2026, 10, 14, 16), allDay: false, title: 'Exam', location: 'Hall' }, { begin: Date.UTC(2026, 10, 15), end: Date.UTC(2026, 10, 16), allDay: true, title: 'Holiday' }]);
    const out = await tools.calendarEvents();
    expect(out).toMatch(/Exam @ Hall/); expect(out).toMatch(/Holiday/); expect(out).toMatch(/all day/);
  });
  it('adds an event, a daily reminder and drafts a message without sending anything', async () => {
    const { tools } = load();
    expect(await tools.addCalendarEvent('x', 'not a date')).toMatch(/Could not understand/);
    expect(await tools.addCalendarEvent('Study', '2026-11-20T10:00', { end: '2026-11-20T11:00', location: 'Library' })).toMatch(/Opened the calendar/);
    expect(await tools.addCalendarEvent('Study', '2026-11-20T10:00', { end: 'bad' })).toMatch(/Opened the calendar/);
    expect(native.addCalendarEvent.mock.calls[1][2] - native.addCalendarEvent.mock.calls[1][1]).toBe(3600000);
    expect(tools.dailyRule()).toBe('FREQ=DAILY'); expect(tools.dailyRule('2026-12-01')).toBe('FREQ=DAILY;UNTIL=20261201T235959Z'); expect(tools.dailyRule('soon')).toBe('FREQ=DAILY');
    expect(await tools.addDailyReminder('Study', { hour: 0, until: '2026-12-01' })).toMatch(/daily reminder/);
    delete native.addRepeatingCalendarEvent; require('react-native').NativeModules.AtlasDevice = { ...native, addRepeatingCalendarEvent: undefined };
    expect(tools.messageUrl('call', '', { to: '(555) 010-2030' })).toBe('tel:5550102030');
    expect(tools.messageUrl('text', 'Hi there', { to: '+1 555' })).toBe('sms:+1555?body=Hi%20there');
    expect(tools.messageUrl('email', 'Body', { to: 'a@b.com', subject: 'Hello' })).toBe('mailto:a@b.com?subject=Hello&body=Body');
    const { Linking } = require('react-native');
    jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined as never);
    expect(await tools.draftMessage('call', '', {})).toMatch(/no phone number/);
    expect(await tools.draftMessage('text', '  ', {})).toMatch(/no text/);
    expect(await tools.draftMessage('call', '', { to: '555' })).toMatch(/call starts only when/);
    expect(await tools.draftMessage('email', 'Hi', { to: 'a@b.com' })).toMatch(/email app/);
    expect(await tools.draftMessage('text', 'Hi', { to: '555' })).toMatch(/Messages/);
    (Linking.openURL as jest.Mock).mockRejectedValue(new Error('none'));
    expect(await tools.draftMessage('email', 'Hi', {})).toMatch(/could not open an email app/);
    expect(await tools.draftMessage('call', '', { to: '555' })).toMatch(/phone app/);
    expect(await tools.draftMessage('text', 'Hi', {})).toMatch(/messaging app/);
  });
  it('remembers a fact once, not in a private chat, with or without an agent', async () => {
    const { tools } = load();
    const { useAboutMe } = require('../../src/stores/aboutMeStore');
    const { useAgentStore } = require('../../src/stores/agentStore');
    const { useChatStore } = require('../../src/stores/chatStore');
    useAgentStore.setState({ activeAgentId: null });
    expect(await tools.rememberFact('I prefer metric')).toBe('Remembered: I prefer metric');
    expect(await tools.rememberFact('I prefer metric')).toBe('Already remembered.');
    expect(useAboutMe.getState()).toBeDefined();
    const agent = useAgentStore.getState().agents[0];
    useAgentStore.setState({ activeAgentId: agent.id });
    expect(await tools.rememberFact('Likes tea')).toBe('Remembered: Likes tea');
    useChatStore.setState({ conversations: [{ id: 'p', title: 'p', messages: [], isPrivate: true, modelId: 'm', createdAt: '', updatedAt: '' }], activeConversationId: 'p' });
    expect(await tools.rememberFact('secret')).toMatch(/private chat/);
  });
});
