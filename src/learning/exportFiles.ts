import RNFS from 'react-native-fs';
import { learningKnowledgeDb } from './knowledgeDb';
import { exportLedger } from './knowledgePorting';
import { toKnowledgeJsonl, type PortableClaim } from './knowledgeInterchange';
import { buildTrainingSet, toSftJsonl, type TrainingManifest } from './trainingExport';
import { exams } from './engine';

const stamp = () => new Date().toISOString().slice(0, 10);
const ALL = ['candidate', 'verified', 'disputed', 'superseded', 'rejected'] as const;

async function folder(): Promise<string> {
  const { workspaceDir } = require('../atlasTools/deviceTools');
  const dir = `${await workspaceDir()}/Atlas exports`;
  await RNFS.mkdir(dir);
  return dir;
}

/** Writes the portable knowledge file. By default only claims a person verified; `everything` adds provisional and disputed ones. */
export async function exportKnowledgeFile(options: { everything: boolean; includePassages: boolean }): Promise<{ path: string; records: number }> {
  const records = exportLedger(learningKnowledgeDb, { statuses: options.everything ? [...ALL] : ['verified'], includePassages: options.includePassages });
  const path = `${await folder()}/atlas-knowledge-${options.everything ? 'all' : 'verified'}-${stamp()}.jsonl`;
  await RNFS.writeFile(path, toKnowledgeJsonl(records), 'utf8');
  return { path, records: records.length };
}

/** Writes train, validation and test files and a manifest. Nothing is trained or uploaded. */
export async function exportTrainingFiles(baseModel: string): Promise<{ dir: string; manifest: TrainingManifest }> {
  const claims = exportLedger(learningKnowledgeDb, { statuses: ['verified'], includePassages: true }).filter((r): r is PortableClaim => r.recordType === 'claim');
  const set = buildTrainingSet({ claims, examQuestions: exams.allQuestions(), baseModel });
  const dir = `${await folder()}/training-${stamp()}`;
  await RNFS.mkdir(dir);
  for (const split of ['train', 'validation', 'test'] as const) await RNFS.writeFile(`${dir}/${split}.jsonl`, toSftJsonl(set.examples[split]), 'utf8');
  await RNFS.writeFile(`${dir}/manifest.json`, JSON.stringify(set.manifest, null, 2), 'utf8');
  return { dir, manifest: set.manifest };
}
