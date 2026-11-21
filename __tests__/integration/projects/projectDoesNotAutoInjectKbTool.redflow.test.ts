/**
 * RED-FLOW (integration) — device 2026-07-14: the quick-settings Tools count showed 0, but a project
 * chat reported "Tools sent in request (1)". resolveToolsAndPrompt auto-injected search_knowledge_base
 * for any project chat, so the tools SENT diverged from the tools the user had toggled (the count SHOWS).
 *
 * SPEC (user's decision): never auto-add tools — only the user's toggled set is sent. A project chat with
 * tools off sends NONE. This drives the REAL startGenerationFn (real stores, real resolveToolsAndPrompt)
 * over the llama.rn boundary and asserts what actually reached the model.
 */
import { installNativeBoundary, GB } from '../../harness/nativeBoundary';
import { makeGenDeps } from '../../harness/genDeps';
import { createProject } from '../../utils/factories';

describe('project chat does NOT auto-inject search_knowledge_base (red-flow)', () => {
  it('with tools toggled OFF, a chat in a real project sends NO tools to the model', async () => {
    const boundary = installNativeBoundary({ llama: true, fs: true, ram: { platform: 'android', totalBytes: 12 * GB, availBytes: 8 * GB } });
    /* eslint-disable @typescript-eslint/no-var-requires */
    const { llmService } = require('../../../src/services/llm');
    const { hardwareService } = require('../../../src/services/hardware');
    const { startGenerationFn } = require('../../../src/screens/ChatScreen/useChatGenerationActions');
    const { useProjectStore, useChatStore } = require('../../../src/stores');
    /* eslint-enable @typescript-eslint/no-var-requires */

    boundary.fs!.seedFile('/models/small.gguf', 500 * 1024 * 1024);
    await hardwareService.refreshMemoryInfo();
    await llmService.loadModel('/models/small.gguf');

    useProjectStore.setState({ projects: [createProject({ id: 'p1', name: 'Research' })] });
    const convId = useChatStore.getState().createConversation('txt', 'In project', 'p1');
    useChatStore.getState().addMessage(convId, { role: 'user', content: 'hi' });
    const { deps } = makeGenDeps({ activeConversationId: convId });

    boundary.llama!.scriptCompletion({ text: 'Hello there.' });
    await startGenerationFn(deps, { targetConversationId: convId, messageText: 'hi', setDebugInfo: () => {} });

    // The Atlas system prompt may mention search_knowledge_base by name. The invariant is
    // that tools-off means the native request carries no tools payload.
    const requests = boundary.llama!.calls.completion.map(call => call[0] as { tools?: unknown });
    expect(requests.length).toBeGreaterThan(0);
    expect(requests.every(request => request.tools == null)).toBe(true);
  });
});
