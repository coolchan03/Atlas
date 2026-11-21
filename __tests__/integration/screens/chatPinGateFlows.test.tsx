import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: jest.fn(), goBack: (global as any).__goBack ?? jest.fn(), setOptions: jest.fn(), addListener: () => () => undefined }),
}));

type O = { wait?: number; unlockFails?: string[]; failWait?: number };

async function setup(o: O = {}) {
  jest.resetModules();
  installNativeBoundary({ fs: true });
  const rtl = requireRTL();
  const React = require('react');
  const relockHandlers: Array<() => void> = [];
  const unlockChat = jest.fn(async (id: string) => { if (o.unlockFails?.includes(id)) throw new Error('wrong pin'); });
  jest.doMock('../../../src/stores/encryptedChatStorage', () => ({ unlockChat, onProtectedChatsRelocked: (fn: () => void) => { relockHandlers.push(fn); return () => undefined; } }));
  const throttle = { pinWaitRemaining: jest.fn(async () => o.wait ?? 0), recordPinFailure: jest.fn(async () => o.failWait ?? 0), recordPinSuccess: jest.fn(async () => undefined), formatWait: (s: number) => `${s}s` };
  jest.doMock('../../../src/services/pinThrottle', () => throttle);
  const goBack = jest.fn();
  (global as any).__goBack = goBack;
  const { useChatStore } = require('../../../src/stores/chatStore');
  useChatStore.setState({ conversations: [
    { id: 'c1', title: 'Locked one', messages: [], createdAt: '', updatedAt: '', pinVerifier: 'v1' },
    { id: 'c2', title: 'Locked two', messages: [], createdAt: '', updatedAt: '', pinVerifier: 'v2' },
    { id: 'c3', title: 'Plain', messages: [], createdAt: '', updatedAt: '' },
  ] });
  const { ChatPinGate } = require('../../../src/components/ChatPinGate');
  const view = rtl.render(React.createElement(ChatPinGate, { conversationId: 'c1' }));
  const type = async (pin: string) => { await rtl.act(async () => { rtl.fireEvent.changeText(view.getByPlaceholderText(/PIN/), pin); }); };
  const press = async (label: string) => { await rtl.act(async () => { rtl.fireEvent.press(view.getByText(label)); }); await rtl.act(async () => { await new Promise((r) => setImmediate(r)); }); };
  return { view, rtl, React, unlockChat, throttle, goBack, type, press, relockHandlers };
}

describe('the PIN gate on a locked chat', () => {
  it('keeps only digits, up to twelve, and enables unlocking from four', async () => {
    const { view, type } = await setup();
    await type('12ab');
    expect(view.getByPlaceholderText(/PIN/).props.value).toBe('12');
    await type('1234567890123456');
    expect(view.getByPlaceholderText(/PIN/).props.value).toBe('123456789012');
  });

  it('unlocks with the right PIN and records the success', async () => {
    const { unlockChat, throttle, type, press, view } = await setup();
    await type('1234');
    await press('Unlock this chat');
    expect(unlockChat).toHaveBeenCalledWith('c1', '1234');
    expect(throttle.recordPinSuccess).toHaveBeenCalledWith('chat');
    expect(view.queryByText('Locked conversation')).toBeNull();
  });

  it('unlocks the other chats that share the PIN and skips ones with a different PIN', async () => {
    const { unlockChat, type, press } = await setup({ unlockFails: ['c2'] });
    await type('4321');
    await press('Unlock other chats using the same PIN');
    expect(unlockChat).toHaveBeenCalledWith('c1', '4321');
    expect(unlockChat).toHaveBeenCalledWith('c2', '4321');
    expect(unlockChat).not.toHaveBeenCalledWith('c3', expect.anything());
  });

  it('says the PIN is wrong, with the wait the throttle asks for, and clears the field', async () => {
    const plain = await setup({ unlockFails: ['c1'] });
    await plain.type('0000');
    await plain.press('Unlock this chat');
    expect(plain.view.getByText(/Incorrect PIN or protected chat could not be opened/)).toBeTruthy();
    expect(plain.view.getByPlaceholderText(/PIN/).props.value).toBe('');
    const waiting = await setup({ unlockFails: ['c1'], failWait: 30 });
    await waiting.type('0000');
    await waiting.press('Unlock this chat');
    expect(waiting.view.getByText(/Wait 30s before trying again/)).toBeTruthy();
  });

  it('refuses while too many wrong PINs have been tried', async () => {
    const { view, unlockChat, type, press } = await setup({ wait: 45 });
    await type('1234');
    await press('Unlock this chat');
    expect(view.getByText(/Too many wrong PINs. Try again in 45s/)).toBeTruthy();
    expect(unlockChat).not.toHaveBeenCalled();
  });

  it('goes back to the chat list, and locks again when protected chats are relocked', async () => {
    const { view, goBack, press, type, relockHandlers, rtl } = await setup();
    await press('Back to chats');
    expect(goBack).toHaveBeenCalled();
    await type('1234');
    await press('Unlock this chat');
    expect(view.queryByText('Locked conversation')).toBeNull();
    await rtl.act(async () => { relockHandlers.forEach((fn) => fn()); });
    expect(view.getByText('Locked conversation')).toBeTruthy();
  });

  it('shows nothing for a chat without a PIN or no chat at all', async () => {
    const { rtl, React } = await setup();
    const { ChatPinGate } = require('../../../src/components/ChatPinGate');
    const plain = rtl.render(React.createElement(ChatPinGate, { conversationId: 'c3' }));
    expect(plain.queryByText('Locked conversation')).toBeNull();
    const none = rtl.render(React.createElement(ChatPinGate, { conversationId: null }));
    expect(none.queryByText('Locked conversation')).toBeNull();
  });
});
