import RNFS from 'react-native-fs';
import { ragService } from '../services/rag';
import { useProjectStore } from '../stores/projectStore';
import { useAgentStore } from '../stores/agentStore';
import { ATLAS_CARDS } from './atlasCards';
import { SURVIVAL_CHAPTERS } from '../survival/content';

export const ATLAS_PROJECT_NAME = 'Atlas - Emergency';

/**
 * Creates the "Atlas - Emergency" project, puts the built-in emergency cards in its
 * knowledge base, and makes the Atlas agent active. Safe to run again: existing cards are skipped.
 */
export async function installAtlasStarter(onProgress?: (msg: string) => void): Promise<{ added: number; skipped: number; projectId: string }> {
  const ps = useProjectStore.getState();
  let project = ps.projects.find((p) => p.name === ATLAS_PROJECT_NAME);
  if (!project) {
    project = ps.createProject({
      name: ATLAS_PROJECT_NAME,
      description: 'Built-in emergency cards. Add more Atlas files to its knowledge base.',
      systemPrompt: '',
      icon: '#DC2626',
    } as any);
  }
  const dir = `${RNFS.DocumentDirectoryPath}/atlas_cards`;
  await RNFS.mkdir(dir);
  let added = 0;
  let skipped = 0;
  // The built-in cards plus every Survival Manual chapter (pictures removed, text kept).
  const docs: Record<string, string> = { ...ATLAS_CARDS };
  for (const c of SURVIVAL_CHAPTERS) {
    if (c.id === 'Credits' || c.id === 'Apps') continue;
    docs[`SurvivalManual_${c.id}.md`] = `# Survival Manual: ${c.title}\n(Source: Survival Manual, based on US Army FM 21-76)\n\n${c.md.replace(/!\[[^\]]*\]\([^)]*\)/g, '')}`;
  }
  const names = Object.keys(docs);
  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    onProgress?.(`Adding ${i + 1} of ${names.length}: ${name.replace(/_/g, ' ').replace('.md', '')}`);
    const path = `${dir}/${name}`;
    await RNFS.writeFile(path, docs[name], 'utf8');
    try {
      await ragService.indexDocument({ projectId: project.id, filePath: path, fileName: name, fileSize: docs[name].length });
      added++;
    } catch (e: any) {
      if (/already in the knowledge base/.test(String(e?.message))) skipped++;
      else throw e;
    }
  }
  const agents = useAgentStore.getState();
  if (agents.getAgent('atlas')) agents.setActiveAgent('atlas');
  return { added, skipped, projectId: project.id };
}
