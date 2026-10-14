import RNFS from 'react-native-fs';
import type { Message } from '../types';
import { ragService, APP_OWNED_DOC_DIR } from './rag';
import { useProjectStore } from '../stores/projectStore';
import { useChatStore } from '../stores/chatStore';

/** Store a finalized assistant report as a Markdown knowledge-base document. */
export async function saveReportToProject(
  projectId: string,
  conversationId: string,
  message: Message,
): Promise<string> {
  const project = useProjectStore.getState().getProject(projectId);
  if (!project) throw new Error('The project no longer exists.');
  if (project.pinVerifier) throw new Error('Reports cannot be saved into a PIN-protected project: the report would be written as a plain file first.');
  // The document index is plain text: a PIN-locked or private chat must never be copied into it.
  const chat = useChatStore.getState().conversations.find(c => c.id === conversationId);
  if (chat?.pinVerifier) throw new Error('This chat is PIN-locked. Saving it to the project would store it unencrypted.');
  if (chat?.isPrivate) throw new Error('Private chats are not saved anywhere, including projects.');
  if (message.role !== 'assistant' || !message.content.trim()) {
    throw new Error('Only complete assistant text replies can be saved.');
  }
  const base = `${RNFS.DocumentDirectoryPath}/${APP_OWNED_DOC_DIR}`;
  const safeChatId = conversationId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeMessageId = message.id.replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `Research-${  safeChatId.slice(0, 28)  }-${  safeMessageId.slice(0, 30)  }.md`;
  const path = `${base  }/${  filename}`;
  await RNFS.mkdir(base);
  const indexed = (await ragService.getDocumentsByProject(projectId)).some(d => d.path === path);
  if (indexed) throw new Error('This report is already saved in the project.');
  // A leftover file from a removed document is simply replaced.
  if (await RNFS.exists(path)) await RNFS.unlink(path).catch(() => undefined);
  const contents = `# Research report\n\n${  message.content.trim()  }\n`;
  await RNFS.writeFile(path, contents, 'utf8');
  try {
    await ragService.indexDocument({
      projectId, filePath: path, fileName: filename, fileSize: contents.length,
    });
    return filename;
  } catch (error) {
    await RNFS.unlink(path).catch(() => undefined);
    throw error;
  }
}
