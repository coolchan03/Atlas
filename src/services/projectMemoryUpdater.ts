/** Non-blocking, on-device summarization after a completed conversation turn. */
import { useChatStore } from '../stores/chatStore';
import { useProjectStore } from '../stores/projectStore';
import { generateStandalone, isRemoteTextModelActive } from './engines';
import { generationSession } from './generationSession';
import { generateId } from '../utils/generateId';
import logger from '../utils/logger';
import { ensureChatKnowledge, mergeChatMemory, parseKnowledgeUpdate, projectKnowledge } from './projectKnowledge';

const processing = new Set<string>();
const scheduled = new Map<string, ReturnType<typeof setTimeout>>();

/** Debounce optional updates so a user typing a quick follow-up takes priority. */
export function scheduleConversationKnowledgeUpdate(chatId: string): void {
  const prior = scheduled.get(chatId);
  if (prior) clearTimeout(prior);
  const projectId = useChatStore.getState().conversations.find(c => c.id === chatId)?.projectId;
  const project = projectId ? useProjectStore.getState().getProject(projectId) : undefined;
  if (!project || !projectKnowledge(project.knowledge).autoUpdate) return;
  const timer = setTimeout(() => {
    scheduled.delete(chatId);
    if (generationSession.getConversationId() !== null) return;
    void updateConversationKnowledge(chatId).catch(err => logger.warn('[ProjectMemory] Update skipped', err));
  }, 2500);
  scheduled.set(chatId, timer);
}


/** Returns true when a saved memory changed; false when the turn needs no update. */
export async function updateConversationKnowledge(chatId: string, force = false): Promise<boolean> {
  if (processing.has(chatId)) return false;
  const conversation = useChatStore.getState().conversations.find(c => c.id === chatId);
  if (!conversation?.projectId || conversation.isPrivate || conversation.pinVerifier) return false;
  const project = useProjectStore.getState().getProject(conversation.projectId);
  // Protected projects cannot currently contain chats. Never persist chat memory outside the PIN vault.
  if (!project || project.pinVerifier) return false;
  const knowledge = projectKnowledge(project.knowledge);
  if (!force && !knowledge.autoUpdate) return false;
  const msgs = conversation.messages.filter(m =>
    (m.role === 'user' || m.role === 'assistant') && !m.isSystemInfo && !m.isStreaming && !!m.content.trim(),
  );
  const last = msgs[msgs.length - 1];
  if (!last || last.role !== 'assistant') return false;
  const latestUser = [...msgs].reverse().find(m => m.role === 'user');
  if (!latestUser) return false;
  if (!force && latestUser.content.length + last.content.length < 85) return false;
  if (!force && knowledge.chats[chatId]?.lastProcessedMessageId === last.id) return false;
  // Never send project memories to a remote service during a silent update.
  if (isRemoteTextModelActive()) {
    if (force) throw new Error('Choose an on-device text model to summarize private project memories.');
    return false;
  }
  if (generationSession.getConversationId() !== null) {
    if (force) throw new Error('The model is busy. Retry after the current response finishes.');
    return false;
  }
  processing.add(chatId);
  const observedMemory = knowledge.chats[chatId]?.content ?? '';
  const observedMessageId = last.id;
  try {
    const input = JSON.stringify({
      previousChatMemory: observedMemory,
      sharedCurrentProgress: knowledge.shared.find(d => d.id === 'current-progress')?.content ?? '',
      recentMessages: msgs.slice(-8).map(m => ({ role: m.role, content: m.content.slice(0, 1600) })),
    });
    const response = await generateStandalone([
      {
        id: 'atlas-memory-policy', timestamp: 0, role: 'system',
        content: 'Maintain a concise living memory for one chat. Return ONLY valid JSON with exactly two string keys: "chatMemory" and "sharedProposal". Merge past memory with new important facts, problems, advice, decisions, strategies tried, their outcomes, progress and unresolved issues. Preserve significant existing information. Do NOT include whole conversation transcripts, invented facts, unsupported conclusions, or duplicates. Label interpretations as tentative. The chatMemory should be organized with short headings or bullet points, at most 2000 characters and 600 output tokens. sharedProposal must be an empty string unless the conversation contains a clear NEW decision or significant development likely to affect other chats in the same project. Shared proposals require user review and must not copy confidential chat details unrelated to the development.',
      },
      { id: 'atlas-memory-data', timestamp: 0, role: 'user', content: input },
    ]);
    const generated = parseKnowledgeUpdate(response);
    if (!generated) {
      logger.warn('[ProjectMemory] Model returned invalid memory JSON; no data changed.');
      if (force) throw new Error('The model did not return a valid memory summary. Nothing was changed.');
      return false;
    }
    const freshConv = useChatStore.getState().conversations.find(c => c.id === chatId);
    const freshProject = useProjectStore.getState().getProject(conversation.projectId);
    if (!freshConv || freshConv.projectId !== conversation.projectId || freshConv.pinVerifier || freshConv.isPrivate || !freshProject || freshProject.pinVerifier) return false;
    const now = new Date().toISOString();
    const latestKnowledge = projectKnowledge(freshProject.knowledge);
    if ((latestKnowledge.chats[chatId]?.content ?? '') !== observedMemory) {
      logger.log('[ProjectMemory] Manual memory edit detected; declining to overwrite.');
      return false;
    }
    // Do not attach this result to a chat that has been truncated, regenerated, or deleted.
    if (freshConv.messages[freshConv.messages.length - 1]?.id !== observedMessageId) return false;
    const withChat = ensureChatKnowledge(latestKnowledge, chatId);
    const proposal = generated.sharedProposal.trim();
    const duplicate = withChat.proposals.some(p => p.chatId === chatId && p.content === proposal)
      || withChat.shared.some(d => d.content.includes(proposal) && !!proposal);
    const next = {
      ...withChat,
      chats: { ...withChat.chats, [chatId]: {
        chatId, content: mergeChatMemory(observedMemory, generated.chatMemory), updatedAt: now, lastProcessedMessageId: observedMessageId,
      } },
      proposals: proposal && !duplicate
        ? [...withChat.proposals, { id: generateId(), chatId, content: proposal, createdAt: now }].slice(-100)
        : withChat.proposals,
    };
    useProjectStore.getState().updateProject(project.id, { knowledge: next });
    return true;
  } catch (error) {
    if (force) throw error;
    logger.warn('[ProjectMemory] Automatic update skipped', error);
    return false;
  } finally {
    processing.delete(chatId);
  }
}
