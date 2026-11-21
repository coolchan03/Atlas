/**
 * One project in one file. The whole-app backup (backup.ts) replaces everything on the phone; this moves a single project (its settings,
 * its chats and its documents with their searchable text) to another phone or back after a reset, and MERGES it into what is there, so
 * nothing else on the receiving phone changes. The file is always password-encrypted because it carries documents and chats.
 * Protected (PIN) projects and locked chats are never exported: they are sealed to one phone.
 */
import RNFS from 'react-native-fs';
import { saveDocuments } from '@react-native-documents/picker';
import { useProjectStore } from '../stores/projectStore';
import { useChatStore } from '../stores/chatStore';
import type { Conversation, Project } from '../types';
import { collectProjectFiles, restoreProjectFiles, validateProjectFiles, type ProjectBackupFile } from './projectBackupFiles';
import { pickBackupText, portableCrypto } from './backup';
import { mergeConversations, mergeProjects } from '../services/nearbySync/merge';

const MAGIC = 'OffGridAtlasProject';
const LIMIT_MB = 35;
const MIN_PASSWORD = 12;
const MAX_CHATS = 2000;

interface ProjectFile { format: typeof MAGIC; version: 1; createdAt: string; project: Project; conversations: Conversation[]; files: ProjectBackupFile[] }

/** Projects that can be exported (not PIN-protected). */
export const exportableProjects = (): Project[] => useProjectStore.getState().projects.filter((p) => !p.pinVerifier && !p.protectedBlob);

/** Everything one project holds, ready to write. Throws a readable message when it cannot be exported. @public */
export async function collectProject(projectId: string): Promise<ProjectFile> {
  const project = useProjectStore.getState().projects.find((p) => p.id === projectId);
  if (!project) throw new Error('That project no longer exists.');
  if (project.pinVerifier || project.protectedBlob) throw new Error('A PIN-protected project is sealed to this phone and cannot be exported. Use the encrypted full backup instead.');
  const conversations = useChatStore.getState().conversations
    .filter((c) => c.projectId === projectId && !c.pinVerifier && Array.isArray(c.messages) && !c.isPrivate);
  const files = await collectProjectFiles([projectId]);
  return { format: MAGIC, version: 1, createdAt: new Date().toISOString(), project, conversations, files };
}

/** Writes the project to a password-encrypted file the person saves. Returns the saved name, or null when nothing was saved. */
export async function exportProject(projectId: string, password: string): Promise<string | null> {
  if (password.length < MIN_PASSWORD) throw new Error(`Use a password of at least ${MIN_PASSWORD} characters.`);
  const data = await collectProject(projectId);
  const json = JSON.stringify(data);
  const bytes = unescape(encodeURIComponent(json)).length;
  if (bytes > LIMIT_MB * 1024 * 1024) throw new Error(`This project is ${(bytes / 1048576).toFixed(1)} MB, over the ${LIMIT_MB} MB limit. Remove some documents and try again.`);
  const safeName = data.project.name.replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 40) || 'project';
  const name = `Atlas-project-${safeName}-${new Date().toISOString().slice(0, 10)}.atlasproject`;
  const path = `${RNFS.CachesDirectoryPath}/${name}`;
  await RNFS.writeFile(path, await portableCrypto().encryptPortableBackup(json, password), 'utf8');
  try {
    const [res] = await saveDocuments({ sourceUris: [`file://${path}`], mimeType: 'application/octet-stream', fileName: name, copy: true });
    return res?.name ?? name;
  } finally { RNFS.unlink(path).catch(() => undefined); }
}

/** Checks a decoded file before anything on the phone is touched. @public */
export function validateProjectFile(value: unknown): ProjectFile {
  const d = value as ProjectFile;
  const id = d?.project?.id;
  if (!d || d.format !== MAGIC || d.version !== 1 || typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id) || typeof d.project.name !== 'string')
    throw new Error('This is not an Atlas project file.');
  if (d.project.pinVerifier || d.project.protectedBlob) throw new Error('This file holds a protected project, which cannot be restored this way.');
  if (!Array.isArray(d.conversations) || d.conversations.length > MAX_CHATS) throw new Error('The project file has an invalid chat list.');
  for (const c of d.conversations) {
    if (!c || typeof c.id !== 'string' || c.projectId !== id || !Array.isArray(c.messages) || c.pinVerifier || c.protectedBlob)
      throw new Error('The project file has a chat that does not belong to the project.');
  }
  if (!Array.isArray(d.files)) throw new Error('The project file has an invalid document list.');
  validateProjectFiles(d.files, [id]);
  return d;
}

/** Merges a decoded project file into this phone. Returns the project's name and how many chats and documents came in. @public */
export async function applyProjectFile(file: ProjectFile): Promise<{ name: string; chats: number; documents: number }> {
  const id = file.project.id;
  // Documents first (their own transaction): if they fail nothing else was touched.
  const documents = file.files.length ? await restoreProjectFiles(file.files, [id], true) : 0;
  const projects = mergeProjects(useProjectStore.getState().projects, [file.project]);
  useProjectStore.setState({ projects: projects.items });
  const chats = mergeConversations(useChatStore.getState().conversations, file.conversations);
  useChatStore.setState({ conversations: chats.items });
  return { name: file.project.name, chats: file.conversations.length, documents };
}

/** Lets the person pick a .atlasproject file and merges it in. Null when nothing was picked. */
export async function importProject(password: string): Promise<{ name: string; chats: number; documents: number } | null> {
  const picked = await pickBackupText(password);
  if (!picked) return null;
  if (!picked.encrypted) throw new Error('Project files are always password-encrypted.');
  return applyProjectFile(validateProjectFile(JSON.parse(picked.text)));
}

