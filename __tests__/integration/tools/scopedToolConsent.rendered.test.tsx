import { setupChatScreen } from '../../harness/chatHarness';
import { installRemoteModel, installRemoteStream } from '../../harness/remoteHarness';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: () => {}, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} }),
  useRoute: () => require('../../harness/chatHarness').routeHolder,
  useFocusEffect: () => {}, useIsFocused: () => true,
}));

type ModelCall = { name: string; arguments: Record<string, unknown> };
const frame = (delta: object, finish?: string) =>
  `data: ${JSON.stringify({ choices: [{ delta, ...(finish ? { finish_reason: finish } : {}) }] })}\n\n`;
const reply = (text: string) => `${frame({ content: text })}${frame({}, 'stop')}data: [DONE]\n\n`;
const toolResponse = (calls: ModelCall[]) => {
  const tool_calls = calls.map((call, index) => ({
    index, id: `tool-${index}`, function: { name: call.name, arguments: JSON.stringify(call.arguments) },
  }));
  return `${frame({ tool_calls })}${frame({}, 'tool_calls')}data: [DONE]\n\n`;
};

async function consentFixture(engine: 'remote' | 'litert') {
  const h = await setupChatScreen({ engine: engine === 'remote' ? 'llama' : 'litert', platform: 'android' });
  if (engine === 'remote') await installRemoteModel({ caps: { supportsToolCalling: true, supportsThinking: false } });
  const { routeHolder } = require('../../harness/chatHarness');
  const { toolsForConversation } = require('../../../src/services/tools/chatTools');
  const { generationService } = require('../../../src/services/generationService');
  const RN = require('react-native');
  const fs = require('react-native-fs');
  const path = `${h.boundary.fs!.DocumentDirectoryPath}/consent-note.txt`;
  await fs.writeFile(path, 'SYNTHETIC PRIVATE CONTENT', 'utf8');
  h.enableToolViaUI('read_file');
  const globalsBefore = [...h.useAppStore.getState().settings.enabledTools];
  const script = (calls: ModelCall[], answer: string) => {
    if (engine === 'remote') installRemoteStream(calls.length ? [toolResponse(calls), reply(answer)] : reply(answer));
    else h.boundary.litert.scriptTurn({ toolCalls: calls, content: answer });
  };
  const idle = async () => {
    await h.rtl.waitFor(() => expect(generationService.getState().isGenerating).toBe(false));
    await h.rtl.waitFor(() => expect(h.useChatStore.getState().isStreaming).toBe(false));
  };
  const finish = async (answer: string) => {
    await idle();
    await h.rtl.waitFor(() => expect(h.useChatStore.getState().conversations
      .find((c: { id: string }) => c.id === h.conversationId)?.messages
      .map((m: { content: string }) => m.content)).toContain(answer));
    const list = h.view!.UNSAFE_getByType(RN.FlatList);
    await h.rtl.waitFor(() => expect(list.props.data.map((m: { content: string }) => m.content)).toContain(answer));
    // Native layout/scroll events expose later rows without replacing the real FlatList.
    const scroll = list.findAll((node: { type: unknown; props: Record<string, unknown> }) =>
      typeof node.type === 'string' && !!node.props.onScroll && !!node.props.onContentSizeChange)[0];
    await h.rtl.userEvent.scrollTo(scroll, {
      y: 9000, contentSize: { width: 400, height: 9600 }, layoutMeasurement: { width: 400, height: 600 },
    });
    await h.rtl.waitFor(() => expect({ answer, shown: h.view!.queryByText(answer) !== null })
      .toEqual({ answer, shown: true }));
  };
  script([], 'Consent fixture ready.');
  h.render();
  await h.tapSend('Start a synthetic consent test.');
  await finish('Consent fixture ready.');
  const chatId = h.conversationId!;
  h.view!.unmount();
  routeHolder.params = { conversationId: chatId };
  h.enableToolViaUI('read_file', false);
  const otherId = h.useChatStore.getState().createConversation('m', 'Another synthetic chat');
  h.useChatStore.getState().setConversationTools(otherId, ['request_tool_access', 'read_file']);
  const restrictedId = h.useChatStore.getState().createConversation('m', 'Still restricted');
  h.useChatStore.getState().setConversationTools(restrictedId, ['request_tool_access']);
  h.useChatStore.getState().setActiveConversation(chatId);
  const conversation = () => h.useChatStore.getState().conversations.find((c: { id: string }) => c.id === chatId);
  expect(toolsForConversation(conversation())).not.toContain('read_file');
  expect(globalsBefore).toContain('read_file');
  h.render();
  const alerts: { message?: string; buttons?: { text?: string; onPress?: () => void }[] }[] = [];
  const alert = jest.spyOn(RN.Alert, 'alert').mockImplementation((title: string, message?: string, buttons?: any) => {
    if (title === 'Enable Atlas tool?') alerts.push({ message, buttons });
  });
  const reads = () => fs.readFile.mock.calls.filter((args: unknown[]) => args[0] === path).length;
  const choose = async (count: number, choice: string) => {
    await h.rtl.waitFor(() => expect(alerts.length).toBeGreaterThanOrEqual(count));
    await h.rtl.act(async () => {
      alerts[count - 1].buttons!.find(button => button.text === choice)!.onPress!();
    });
  };
  const access: ModelCall = { name: 'request_tool_access', arguments: {
    tool_name: 'read_file',
    arguments_json: JSON.stringify({ path, conversationId: otherId, enabledTools: ['read_file'] }),
    // A model cannot choose its authorization scope or enable itself.
    conversationId: otherId, context: { conversationId: otherId }, enabledTools: ['read_file'],
  } };
  const direct: ModelCall = { name: 'read_file', arguments: { path } };
  const allowed = (id = chatId) =>
    toolsForConversation(h.useChatStore.getState().conversations.find((c: { id: string }) => c.id === id));
  const unchangedOthers = () => {
    expect(h.useAppStore.getState().settings.enabledTools).toEqual(globalsBefore);
    expect(allowed(otherId)).toEqual(['request_tool_access', 'read_file']);
    expect(allowed(restrictedId)).toEqual(['request_tool_access']);
  };
  const close = async () => {
    try {
      await h.rtl.act(async () => {
        if (generationService.getState().isGenerating) await generationService.stopGeneration();
        alerts.forEach(prompt => prompt.buttons?.find(button => button.text === 'Not now')?.onPress?.());
      });
    } finally {
      h.view?.unmount();
      alert.mockRestore();
    }
  };
  return { h, chatId, conversation, script, idle, finish, alerts, reads, choose, access, direct, allowed, unchangedOthers, close };
}

it.each(['remote', 'litert'] as const)('%s keeps Not now effective across nested retries and a direct fallback', async engine => {
  const c = await consentFixture(engine);
  try {
    c.script([c.access, c.direct, c.access], 'Denied requests finished.');
    await c.h.tapSend('Try this synthetic request and its retries.');
    await c.h.rtl.waitFor(() => expect(c.alerts.length + c.reads()).toBeGreaterThan(0));
    expect(c.reads()).toBe(0);
    await c.choose(1, 'Not now');
    await c.choose(2, 'Not now');
    await c.finish('Denied requests finished.');
    expect(c.reads()).toBe(0);
    const results = c.conversation().messages.filter((m: { role: string }) => m.role === 'tool');
    expect(results.filter((m: { content: string }) => m.content.includes('declined access'))).toHaveLength(2);
    expect(results.some((m: { content: string }) => m.content.includes('disabled for this turn'))).toBe(true);
    expect(c.h.view!.queryAllByTestId('tool-result-label-request_tool_access').length).toBeGreaterThan(0);
    c.unchangedOthers();
  } finally { await c.close(); }
});

it.each(['remote', 'litert'] as const)('%s grants Once only to the selected call', async engine => {
  const c = await consentFixture(engine);
  try {
    c.script([c.access, c.access, c.direct], 'Once request finished.');
    await c.h.tapSend('Allow one synthetic file read only.');
    await c.choose(1, 'Once');
    await c.choose(2, 'Not now');
    await c.finish('Once request finished.');
    expect(c.reads()).toBe(1);
    expect(c.alerts).toHaveLength(2);
    expect(c.allowed()).not.toContain('read_file');
    const results = c.conversation().messages.filter((m: { role: string }) => m.role === 'tool');
    expect(results.filter((m: { content: string }) => m.content.includes('SYNTHETIC PRIVATE CONTENT'))).toHaveLength(1);
    expect(results.some((m: { content: string }) => m.content.includes('disabled for this turn'))).toBe(true);
    c.unchangedOthers();
  } finally { await c.close(); }
});

it.each(['remote', 'litert'] as const)('%s keeps Always in the requesting chat and permits a later turn', async engine => {
  const c = await consentFixture(engine);
  try {
    c.script([c.access], 'Always request finished.');
    await c.h.tapSend('Enable this synthetic tool for this chat.');
    await c.choose(1, 'Always');
    await c.finish('Always request finished.');
    expect(c.alerts[0].message).toContain('in this chat');
    expect(c.reads()).toBe(1);
    expect(c.allowed()).toContain('read_file');
    c.unchangedOthers();

    c.script([c.access, c.direct], 'Later approved turn finished.');
    await c.h.tapSend('Use the previously approved tool again.');
    await c.finish('Later approved turn finished.');
    expect(c.reads()).toBe(3);
    expect(c.alerts).toHaveLength(1);
    c.unchangedOthers();
  } finally { await c.close(); }
});

it.each(['remote', 'litert'] as const)('%s refuses approval after the host chat is deleted', async engine => {
  const c = await consentFixture(engine);
  try {
    c.script([c.access], 'Deleted host request finished.');
    await c.h.tapSend('Request synthetic file access.');
    await c.h.rtl.waitFor(() => expect(c.alerts).toHaveLength(1));
    await c.h.rtl.act(async () => c.h.useChatStore.getState().deleteConversation(c.chatId));
    await c.choose(1, 'Always');
    await c.idle();
    expect(c.reads()).toBe(0);
    expect(c.conversation()).toBeUndefined();
    c.unchangedOthers();
  } finally { await c.close(); }
});
