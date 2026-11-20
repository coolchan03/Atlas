/**
 * One project as one ZIP: the project itself, what its learners have learned (claims and cards, candidates AND verified, with their
 * passages; the learned notes, lessons and study questions) and the documents of the project (originals, plus their searchable text).
 * Nothing in it depends on which model wrote it. Layout:
 *   manifest.json          what is in the bundle, with the size and SHA-256 of every other file
 *   project.json           the project record
 *   learning/subjects.json learned notes, lessons, study questions and settings of each learner of the project
 *   learning/claims.jsonl  the claims with citations and passages, and learning progress (atlas-knowledge-jsonl)
 *   learning/reports.json  the full reports the claims came from
 *   learning/cards.json    the short cards (a readable view of the claims)
 *   documents/index.json, documents/originals/*, documents/chunks/*
 * Import checks every file against the manifest first and changes nothing when anything is wrong. Importing the same bundle again adds
 * nothing. Exam questions and the Judge's records are not part of it.
 */
import RNFS from 'react-native-fs';
import { sha256 } from 'js-sha256';
import { learningKnowledgeDb, type LearningKnowledgeDb } from './knowledgeDb';
import { exportLedger, importLedger } from './knowledgePorting';
import { toKnowledgeJsonl, validateKnowledgeRecord } from './knowledgeInterchange';
import { loadCards } from './knowledgeCards';
import { newItem, useLearningStore, type LearnConfig } from './store';
import { useProjectStore } from '../stores/projectStore';
import { ragService } from '../services/rag';
import { readablePath } from '../atlasTools/projectBackupFiles';
import type { Project } from '../types';

const BUNDLE_FORMAT = 'atlas-project-bundle';
const VERSION = 1;
const ALL_STATUSES = ['candidate', 'verified', 'disputed', 'superseded', 'rejected'] as const;
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const SAFE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9 _.\-/()]{1,300}$/;

interface BundleFile { path: string; size: number; sha256: string }
export interface BundleManifest {
  format: typeof BUNDLE_FORMAT; version: number; createdAt: string; project: { id: string; name: string };
  counts: { documents: number; claims: number; subjects: number; reports: number }; files: BundleFile[];
}
interface BundleNote { q: string; answer: string; at: number; score?: number }
interface BundleSubject {
  agentId: string; name: string;
  config: Pick<LearnConfig, 'topic' | 'mode' | 'bankSize' | 'reportsPerJudge' | 'judgesPerManager' | 'useLibrary' | 'useWeb' | 'webDomains' | 'continuous' | 'judgeStrictness'>;
  notes: BundleNote[]; lessons: string; direction: string; judgeNote: string; round: number;
  bank: Array<{ q: string; status: string; reason?: string; round: number }>;
}
interface DocEntry { name: string; size: number; enabled: boolean; createdAt: string; file: string; chunks: string }

const rows = (db: LearningKnowledgeDb, sql: string, params: Array<string | number> = []): Array<Record<string, any>> => (db.sql(sql, params).rows ?? []) as Array<Record<string, any>>;
const marks = (n: number) => Array.from({ length: n }, () => '?').join(',');
const hashText = (text: string): BundleFile['sha256'] => sha256(text);
const bytesOf = (text: string): number => unescape(encodeURIComponent(text)).length;

/** The learning subjects (learners) that work on a project. */
function projectSubjects(projectId: string): Array<{ agentId: string; name: string; topic: string }> {
  const st = useLearningStore.getState();
  return Object.entries(st.config).filter(([, c]) => c.projectId === projectId).map(([agentId, c]) => {
    let name = st.experts.find((e) => e.id === agentId)?.name;
    if (!name) { try { name = require('../stores/agentStore').useAgentStore.getState().getAgent(agentId)?.name; } catch { /* no agent store */ } }
    return { agentId, name: name || agentId, topic: c.topic };
  });
}

function subjectPayload(agentId: string, name: string): BundleSubject {
  const st = useLearningStore.getState();
  const c = st.getConfig(agentId); const s = st.get(agentId);
  const { topic, mode, bankSize, reportsPerJudge, judgesPerManager, useLibrary, useWeb, webDomains, continuous, judgeStrictness } = c; // the models are not exported: they are chosen on each phone
  return {
    agentId, name, config: { topic, mode, bankSize, reportsPerJudge, judgesPerManager, useLibrary, useWeb, webDomains, continuous, judgeStrictness },
    notes: s.notes, lessons: s.lessons, direction: s.direction, judgeNote: s.judgeNote, round: s.round,
    bank: s.bank.filter((b) => b.status !== 'dropped').map((b) => ({ q: b.q, status: b.status, reason: b.reason, round: b.round })),
  };
}

/** Writes the bundle's files into an empty folder and returns its manifest. Throws a readable message for a project that cannot be exported. */
export async function writeProjectBundle(projectId: string, dir: string, db: LearningKnowledgeDb = learningKnowledgeDb): Promise<BundleManifest> {
  const project = useProjectStore.getState().projects.find((p) => p.id === projectId);
  if (!project) throw new Error('That project no longer exists.');
  if (project.pinVerifier || project.protectedBlob) throw new Error('A PIN-protected project is sealed to this phone and cannot be exported this way.');
  const files: BundleFile[] = [];
  const text = async (path: string, body: string) => {
    await RNFS.mkdir(`${dir}/${path.split('/').slice(0, -1).join('/')}`.replace(/\/$/, ''));
    await RNFS.writeFile(`${dir}/${path}`, body, 'utf8');
    files.push({ path, size: bytesOf(body), sha256: hashText(body) });
  };
  const subjects = projectSubjects(projectId);
  const ids = subjects.map((s) => s.agentId);
  // The claims of these learners' reports, and older claims whose report was never archived but whose topic is one of theirs.
  const topics = [...new Set(subjects.map((s) => s.topic).filter(Boolean))];
  const claimIds = new Set(ids.length ? rows(db, `SELECT c.id FROM atlas_claims c LEFT JOIN atlas_report_archive r ON r.id = c.report_id
    WHERE r.subject_id IN (${marks(ids.length)}) ${topics.length ? `OR (r.id IS NULL AND c.topic IN (${marks(topics.length)}))` : ''}`, [...ids, ...topics]).map((r) => String(r.id)) : []);
  const records = exportLedger(db, { statuses: [...ALL_STATUSES], includePassages: true, scope: { claimIds, subjectIds: new Set(ids) } });
  const reports = ids.length ? rows(db, `SELECT * FROM atlas_report_archive WHERE subject_id IN (${marks(ids.length)}) ORDER BY id`, ids) : [];
  const cards = (await Promise.all(subjects.map((s) => loadCards(s.topic, s.agentId).catch(() => [])))).flat();

  await text('project.json', JSON.stringify(project, null, 1));
  await text('learning/subjects.json', JSON.stringify(subjects.map((s) => subjectPayload(s.agentId, s.name)), null, 1));
  await text('learning/claims.jsonl', toKnowledgeJsonl(records));
  await text('learning/reports.json', JSON.stringify(reports));
  await text('learning/cards.json', JSON.stringify(cards, null, 1));

  const docs: DocEntry[] = [];
  const documents = await ragService.getDocumentsByProject(projectId);
  for (const [n, d] of documents.entries()) {
    const source = await readablePath(d.path, d.name);
    const file = `documents/originals/${n}-${fileName(d.name)}`;
    await RNFS.mkdir(`${dir}/documents/originals`);
    await RNFS.copyFile(source, `${dir}/${file}`);
    files.push({ path: file, size: Number((await RNFS.stat(`${dir}/${file}`)).size), sha256: await RNFS.hash(`${dir}/${file}`, 'sha256') });
    const chunks = (await ragService.getDocumentChunks(d.id)).map(({ content, position }) => ({ content, position }));
    await text(`documents/chunks/${n}.json`, JSON.stringify(chunks));
    docs.push({ name: d.name, size: Number(d.size) || files[files.length - 2].size, enabled: d.enabled !== 0, createdAt: d.created_at, file, chunks: `documents/chunks/${n}.json` });
  }
  await text('documents/index.json', JSON.stringify(docs));

  const manifest: BundleManifest = {
    format: BUNDLE_FORMAT, version: VERSION, createdAt: new Date().toISOString(), project: { id: project.id, name: project.name },
    counts: { documents: docs.length, claims: records.filter((r) => r.recordType === 'claim').length, subjects: subjects.length, reports: reports.length }, files,
  };
  await RNFS.writeFile(`${dir}/manifest.json`, JSON.stringify(manifest, null, 1), 'utf8');
  return manifest;
}

/** Problems with a manifest and the files actually found, or an empty list. Pure. */
function bundleProblems(manifest: unknown, found: Record<string, { size: number; sha256: string }>): string[] {
  const m = manifest as BundleManifest;
  if (!m || m.format !== BUNDLE_FORMAT) return ['This is not an Atlas project bundle.'];
  if (!Number.isInteger(m.version) || m.version > VERSION) return ['This bundle was made by a newer Atlas. Update Atlas to open it.'];
  if (!SAFE_ID.test(String(m.project?.id)) || !Array.isArray(m.files)) return ['The bundle\'s list of files is damaged.'];
  const problems: string[] = [];
  const required = ['project.json', 'learning/subjects.json', 'learning/claims.jsonl', 'learning/reports.json', 'documents/index.json'];
  for (const r of required) if (!m.files.some((f) => f.path === r)) problems.push(`The bundle has no ${r}.`);
  const seen = new Set<string>();
  for (const f of m.files) {
    if (!f || typeof f.path !== 'string' || !SAFE_PATH.test(f.path) || seen.has(f.path)) { problems.push('The bundle lists a file with an unsafe or repeated path.'); continue; }
    seen.add(f.path);
    const actual = found[f.path];
    if (!actual) problems.push(`${f.path} is missing.`);
    else if (actual.size !== f.size || actual.sha256 !== f.sha256) problems.push(`${f.path} does not match its checksum (damaged or changed).`);
  }
  return problems;
}

export interface BundleResult { project: string; documents: number; records: number; skippedRecords: number; notes: number; questions: number }

const readJson = async <T,>(dir: string, path: string): Promise<T> => JSON.parse(await RNFS.readFile(`${dir}/${path}`, 'utf8')) as T;
const fileName = (name: string): string => name.replace(/[^A-Za-z0-9 _.\-()]+/g, '_').slice(0, 120);

/** Reads the manifest and checks every file against it. Throws before anything on the phone is touched. */
async function verifyUnpacked(dir: string): Promise<BundleManifest> {
  const manifest = await readJson<BundleManifest>(dir, 'manifest.json');
  const found: Record<string, { size: number; sha256: string }> = {};
  for (const f of Array.isArray(manifest?.files) ? manifest.files : []) {
    if (typeof f?.path !== 'string' || !SAFE_PATH.test(f.path) || !(await RNFS.exists(`${dir}/${f.path}`))) continue;
    found[f.path] = { size: Number((await RNFS.stat(`${dir}/${f.path}`)).size), sha256: await RNFS.hash(`${dir}/${f.path}`, 'sha256') };
  }
  const problems = bundleProblems(manifest, found);
  if (problems.length) throw new Error(`Nothing was imported. ${problems.slice(0, 3).join(' ')}`);
  return manifest;
}

/** Adds the bundle's documents to the project; one already there (same name and size) is left alone. Returns how many were added. */
async function restoreDocuments(dir: string, projectId: string, docs: Array<DocEntry & { chunkRows: ChunkRow[] }>): Promise<number> {
  const have = await ragService.getDocumentsByProject(projectId);
  const root = `${RNFS.DocumentDirectoryPath}/atlas-project-files/${projectId}`;
  const incoming: Array<Parameters<typeof ragService.appendProjectDocuments>[0][number]> = [];
  for (const [i, d] of docs.entries()) {
    if (have.some((h) => h.name === d.name && Number(h.size) === d.size)) continue;
    await RNFS.mkdir(root);
    const path = `${root}/${Date.now().toString(36)}_${i}_${fileName(d.name)}`;
    await RNFS.copyFile(`${dir}/${d.file}`, path);
    incoming.push({ projectId, name: d.name, path, size: d.size, enabled: d.enabled, createdAt: d.createdAt, chunks: d.chunkRows });
  }
  if (incoming.length) await ragService.appendProjectDocuments(incoming);
  return incoming.length;
}

/** Learners: settings only where there are none; notes and study questions only the ones not already there. A learner that already works on another project is left alone. */
function mergeSubjects(subjects: BundleSubject[], projectId: string): { notes: number; questions: number } {
  let notes = 0; let questions = 0;
  for (const s of subjects) {
    const existing = useLearningStore.getState().config[s.agentId];
    if (existing?.projectId && existing.projectId !== projectId) continue; // someone else's learner: never mix the two
    if (s.agentId.startsWith('expert-') && !useLearningStore.getState().experts.some((e) => e.id === s.agentId)) useLearningStore.setState((st) => ({ experts: [...st.experts, { id: s.agentId, name: s.name }] }));
    if (!existing) useLearningStore.getState().setConfig(s.agentId, { ...s.config, projectId });
    const cur = useLearningStore.getState().get(s.agentId);
    const newNotes = s.notes.filter((n) => !cur.notes.some((c) => c.q === n.q));
    const newQuestions = s.bank.filter((b) => !cur.bank.some((c) => c.q === b.q));
    notes += newNotes.length; questions += newQuestions.length;
    useLearningStore.getState().patch(s.agentId, {
      notes: [...cur.notes, ...newNotes], lessons: cur.lessons || s.lessons, direction: cur.direction || s.direction, round: Math.max(cur.round, s.round),
      bank: [...cur.bank, ...newQuestions.map((b) => ({ ...newItem(b.q, b.round || 1, b.status as never), reason: b.reason }))],
    });
  }
  return { notes, questions };
}

type ChunkRow = { content: string; position: number };
const isText = (v: unknown): v is string => typeof v === 'string';

/** Reads and checks EVERYTHING in the bundle before anything on the phone changes. Throws "Nothing was imported" for the first thing wrong. */
async function prepareBundle(dir: string) {
  const bad = (what: string): never => { throw new Error(`Nothing was imported. ${what}`); };
  const manifest = await verifyUnpacked(dir);
  const listed = new Set(manifest.files.map((f) => f.path));
  const project = await readJson<Project>(dir, 'project.json');
  if (project.id !== manifest.project.id || project.pinVerifier || project.protectedBlob) bad('The bundle\'s project record is not valid.');
  const subjects = await readJson<BundleSubject[]>(dir, 'learning/subjects.json');
  if (!Array.isArray(subjects) || subjects.some((s) => !s || !isText(s.agentId) || !SAFE_ID.test(s.agentId) || !isText(s.name) || !Array.isArray(s.notes) || !Array.isArray(s.bank)
    || s.notes.some((n) => !n || !isText(n.q) || !isText(n.answer)) || s.bank.some((b) => !b || !isText(b.q)) || !s.config || !isText(s.config.topic))) bad('The learners in the bundle are damaged.');
  const reports = await readJson<Array<Record<string, any>>>(dir, 'learning/reports.json');
  if (!Array.isArray(reports) || reports.some((r) => !r || !isText(r.id) || !isText(r.subject_id) || !isText(r.question) || !isText(r.report_text))) bad('The reports in the bundle are damaged.');
  const lines = (await RNFS.readFile(`${dir}/learning/claims.jsonl`, 'utf8')).split('\n').filter(Boolean).map((l) => JSON.parse(l));
  lines.forEach(validateKnowledgeRecord); // throws on the first malformed record
  const index = await readJson<DocEntry[]>(dir, 'documents/index.json');
  if (!Array.isArray(index)) bad('The document list is damaged.');
  const docs: Array<DocEntry & { chunkRows: ChunkRow[] }> = [];
  for (const d of index) {
    if (!d || !isText(d.name) || !Number.isFinite(d.size) || !listed.has(d.file) || !listed.has(d.chunks)) bad('A document in the bundle is not listed in its manifest.');
    const chunkRows = await readJson<ChunkRow[]>(dir, d.chunks);
    if (!Array.isArray(chunkRows) || !chunkRows.length || chunkRows.some((c) => !c || !isText(c.content) || !Number.isInteger(c.position))) bad(`The text of "${d.name}" is damaged.`);
    docs.push({ ...d, chunkRows });
  }
  return { project, subjects, reports, lines, docs };
}

/** Checks an unpacked bundle completely, then merges it into this phone. Nothing is overwritten and importing the same bundle twice adds nothing. */
export async function applyProjectBundle(dir: string, db: LearningKnowledgeDb = learningKnowledgeDb): Promise<BundleResult> {
  const { project, subjects, reports, lines, docs } = await prepareBundle(dir);
  // The learned records first, in ONE database transaction (the reports so each claim knows its learner, then the claims with the status they had).
  const ledger = importLedger(db, lines, { keepStatus: true, before: () => {
    for (const r of reports) {
      db.sql(`INSERT OR IGNORE INTO atlas_report_archive (id, subject_id, question, report_text, source_text, source_list_json, original_timestamp, judge_status, judge_score, judge_reason, archived_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [r.id, r.subject_id, r.question, r.report_text, r.source_text ?? '', r.source_list_json ?? '[]', r.original_timestamp ?? 0, r.judge_status ?? 'pass', r.judge_score ?? null, r.judge_reason ?? null, r.archived_at ?? new Date().toISOString()]);
    }
  } });
  const documents = await restoreDocuments(dir, project.id, docs);
  // The project: an existing one with this id is left exactly as it is; otherwise it is added.
  if (!useProjectStore.getState().projects.some((p) => p.id === project.id)) useProjectStore.setState((st) => ({ projects: [...st.projects, project] }));
  const learned = mergeSubjects(subjects, project.id);
  return { project: project.name, documents, records: ledger.added, skippedRecords: ledger.skipped, ...learned };
}
