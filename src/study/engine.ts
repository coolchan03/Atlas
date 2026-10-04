/**
 * Atlas study mode (NotebookLM-style) for one project's documents. Everything is
 * generated on the phone with the loaded model, and every item points back to the
 * exact source passage it came from ([1], [2] ... tap to read the passage).
 */
import { ragService } from '../services/rag';
import { ragDatabase } from '../services/rag/database';
import { ensureTextModel } from '../atlasTools/models';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Source { n: number; doc: string; part: number; text: string; origin?: 'project' | 'library' | 'web'; url?: string }
export interface Card { q: string; a: string; src: number[] }
export interface QuizItem { q: string; options: string[]; answer: number; why: string; src: number[] }
export interface PodcastLine { host: 'A' | 'B' | 'C'; text: string }
export interface Slide { title: string; bullets: string[]; narration: string; src: number[] }

export interface StudyResult {
  kind: 'guide' | 'cards' | 'quiz' | 'podcast' | 'slides' | 'answer' | 'outline';
  createdAt: number;
  topic: string;
  title?: string;
  sources: Source[];
  text?: string;
  cards?: Card[];
  quiz?: QuizItem[];
  podcast?: PodcastLine[];
  hosts?: number;
  slides?: Slide[];
}

interface StudyState {
  saved: Record<string, StudyResult[]>; // by project
  add: (projectId: string, r: StudyResult) => void;
  remove: (projectId: string, createdAt: number) => void;
}
export const useStudyStore = create<StudyState>()(
  persist(
    (set) => ({
      saved: {},
      add: (pid, r) => set((s) => ({ saved: { ...s.saved, [pid]: [r, ...(s.saved[pid] || [])].slice(0, 40) } })),
      remove: (pid, at) => set((s) => ({ saved: { ...s.saved, [pid]: (s.saved[pid] || []).filter((x) => x.createdAt !== at) } })),
    }),
    { name: 'atlas-study', storage: createJSONStorage(() => AsyncStorage) },
  ),
);

const SOURCE_CHARS = 700;
/** Characters of source text that fit the loaded model's context (about 3 chars per token, minus room for the answer). */
function budget(): number {
  try {
    const { llmService } = require('../services/llm');
    const ctx = Number(llmService.getPerformanceSettings?.()?.contextLength) || 2048;
    return Math.max(1500, Math.min(12000, (ctx - 900) * 3 - 1200));
  } catch { return 3000; }
}
export const trimSources = (src: Source[]): Source[] => {
  const max = budget(); let used = 0; const out: Source[] = [];
  for (const x of src) { if (used + x.text.length > max) break; used += x.text.length; out.push(x); }
  return out.map((x, i) => ({ ...x, n: i + 1 }));
};
/** Removes markdown decoration small models like to add around the requested format. */
const tidy = (t: string) => t.replace(/\*\*|__/g, '').replace(/^\s*(?:[-*•]|\d+[.)])\s+(?=(?:Q|A|ANSWER|WHY|SRC|TITLE|SAY|[A-D])\s*[:).])/gim, '');

/** Sources for a topic (search) or, with no topic, a spread across all documents. */
export async function gatherSources(projectId: string, topic: string, share = 1): Promise<Source[]> {
  let raw: { name: string; content: string; position: number }[] = [];
  if (topic.trim()) {
    const r: any = await ragService.searchProject(projectId, topic.trim());
    raw = (r?.chunks || []).slice(0, 8);
  }
  if (raw.length < 4) {
    const all = ragDatabase.getChunksByProject(projectId, 3000) as any[];
    // Even spread: every document gets a share, evenly spaced through it.
    const byDoc = new Map<string, any[]>();
    all.forEach((c) => { if (!byDoc.has(c.name)) byDoc.set(c.name, []); byDoc.get(c.name)!.push(c); });
    const perDoc = Math.max(1, Math.floor(8 / Math.max(1, byDoc.size)));
    for (const list of byDoc.values()) {
      list.sort((a, b) => a.position - b.position);
      for (let i = 0; i < perDoc && i < list.length; i++) raw.push(list[Math.floor((i * list.length) / perDoc)]);
    }
  }
  const out: Source[] = [];
  let used = 0;
  const max = budget() * share;
  for (const c of raw) {
    const text = String(c.content).replace(/\s+/g, ' ').trim().slice(0, SOURCE_CHARS);
    if (!text || out.some((o) => o.text === text)) continue;
    if (used + text.length > max) break;
    out.push({ n: out.length + 1, doc: c.name, part: (c.position ?? 0) + 1, text });
    used += text.length;
  }
  return out;
}

const sourceBlock = (s: Source[]) => s.map((x) => `[${x.n}] (${x.doc}, part ${x.part})\n${x.text}`).join('\n\n');
const refs = (t: string) => [...new Set([...t.matchAll(/\[(\d{1,2})\]/g)].map((m) => Number(m[1])))];

async function ask(system: string, user: string): Promise<string> {
  await ensureTextModel(null);
  const { llmService } = require('../services/llm');
  for (let i = 0; llmService.isCurrentlyGenerating() && i < 40; i++) await new Promise((r) => setTimeout(r, 1500));
  if (llmService.isCurrentlyGenerating()) throw new Error('The AI is busy answering a chat. Wait for it to finish (or stop it), then try again.');
  const out: string = await llmService.generateResponse(
    [{ id: 's', role: 'system', content: system, timestamp: 0 }, { id: 'u', role: 'user', content: user, timestamp: 0 }],
    { disableThinking: true },
  );
  return out.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

const LINE_RE = /^\s*(?:[-*•]|\d+[.)])?\s*\**\s*(?:HOST|SPEAKER)?\s*([ABC])\**\s*[:\-–—]\s*\**\s*(.+)$/i;
const GROUND = 'Use ONLY the numbered sources. After every fact put the source number in brackets like [2]. If the sources do not cover something, do not invent it.';

export async function generate(projectId: string, kind: StudyResult['kind'], topic: string): Promise<StudyResult> {
  const sources = await gatherSources(projectId, topic);
  if (!sources.length) throw new Error('This project has no documents in its knowledge base yet.');
  const S = `SOURCES:\n${sourceBlock(sources)}\n\n`;
  const about = topic.trim() ? `Focus: ${topic.trim()}\n` : '';
  const base: StudyResult = { kind, createdAt: Date.now(), topic: topic.trim(), sources };

  if (kind === 'answer') {
    const t = await ask(`You answer questions from documents. ${GROUND} Be clear and short.`, `${S}QUESTION: ${topic}`);
    return { ...base, text: t };
  }
  if (kind === 'guide') {
    const t = await ask(`You write study guides. ${GROUND}`, `${S}${about}Write a study guide with: a 3-sentence summary, the key ideas as short bullet points, important terms with one-line definitions, and 3 questions to think about. Use markdown headings.`);
    return { ...base, text: t };
  }
  if (kind === 'outline') {
    const t = await ask(`You make mind-map outlines. ${GROUND}`, `${S}${about}Make a mind-map style outline: one main topic, 3-6 branches, 2-4 short points under each branch (nested markdown bullets). Cite sources.`);
    return { ...base, text: t };
  }
  if (kind === 'cards') {
    const t = await ask(`You make flashcards. ${GROUND}`, `${S}${about}Make 8 flashcards. One per line, exactly this format:\nQ: question | A: short answer | SRC: number\nNothing else.`);
    const T = tidy(t);
    const srcOf = (x?: string) => refs(`[${(x || '').replace(/[[\]]/g, '').split(/[,\s]+/).filter(Boolean).join('][')}]`);
    let cards: Card[] = T.split('\n').map((l) => {
      const m = l.match(/Q:\s*(.+?)\s*\|\s*A:\s*(.+?)\s*(?:\|\s*(?:SRC|SOURCES?)\s*:\s*([\d,\s[\]]+))?[.\s]*$/i);
      return m ? { q: m[1].trim(), a: m[2].trim(), src: srcOf(m[3]) } : null;
    }).filter(Boolean) as Card[];
    if (!cards.length) {
      // Fallback: "Q: ..." and "A: ..." on separate lines.
      cards = [...T.matchAll(/Q:\s*(.+)\n+\s*A:\s*(.+?)(?:\s*\|?\s*SRC:\s*([\d,\s[\]]+))?\s*$/gim)].map((m) => ({ q: m[1].trim(), a: m[2].trim(), src: srcOf(m[3]).length ? srcOf(m[3]) : refs(m[0]) }));
    }
    if (!cards.length) throw new Error('The model did not produce flashcards in the expected format. Try again or use a bigger model.');
    return { ...base, cards };
  }
  if (kind === 'quiz') {
    const t = await ask(`You write multiple-choice quizzes. ${GROUND}`, `${S}${about}Write 5 questions. For each, exactly:\nQ: question\nA) option\nB) option\nC) option\nD) option\nANSWER: letter\nWHY: one sentence\nSRC: number\n(blank line between questions)`);
    const T = tidy(t);
    // Split on each question start (tolerates blank lines between a question and its options).
    const blocks = T.split(/\n(?=\s*Q(?:uestion)?\s*\d*\s*[:.)])/i);
    const quiz: QuizItem[] = blocks.map((b) => {
      const q = b.match(/^\s*Q(?:uestion)?\s*\d*\s*[:.)]\s*(.+)/im)?.[1]?.trim();
      const opts = ['A', 'B', 'C', 'D'].map((L) => b.match(new RegExp(`^\\s*\\(?${L}\\s*[).:\\-–]\\s*(.+)$`, 'mi'))?.[1]?.trim()).filter(Boolean) as string[];
      const ans = 'ABCD'.indexOf((b.match(/ANSWER\s*[:\-]?\s*(?:option\s*)?\(?([A-D])\b/i)?.[1] || '').toUpperCase());
      if (!q || opts.length < 2 || ans < 0) return null;
      return { q, options: opts, answer: ans, why: b.match(/WHY:\s*(.+)/i)?.[1]?.trim() || '', src: refs(`[${(b.match(/SRC:\s*([\d,\s[\]]+)/i)?.[1] || '').replace(/[[\]]/g, '').split(/[,\s]+/).filter(Boolean).join('][')}]`) };
    }).filter(Boolean) as QuizItem[];
    if (!quiz.length) throw new Error('The model did not produce a quiz in the expected format. Try again or use a bigger model.');
    return { ...base, quiz };
  }
  if (kind === 'podcast') {
    const t = await ask(
      'You write short, lively two-person podcast conversations that explain documents. Facts must come only from the sources. Do not put source numbers in the dialogue.',
      `${S}${about}Write a 14-18 line conversation between two hosts: A (curious, asks questions) and B (explains). Natural, friendly, plain spoken English, no sound effects. Exactly this format, one line each:\nA: ...\nB: ...`,
    );
    const podcast: PodcastLine[] = t.split('\n').map((l) => {
      const m = l.match(LINE_RE);
      return m ? { host: (m[1].toUpperCase() === 'A' ? 'A' : 'B') as 'A' | 'B', text: m[2].replace(/\[\d+\]|\*/g, '').trim() } : null;
    }).filter(Boolean) as PodcastLine[];
    if (podcast.length < 4) throw new Error('The model did not write the conversation in the expected format. Try again.');
    return { ...base, podcast };
  }
  // slides (narrated, like a short explainer video)
  const t = await ask(`You make short explainer slideshows. ${GROUND}`, `${S}${about}Make 6 slides. For each slide, exactly:\nTITLE: ...\n- bullet\n- bullet\n- bullet\nSAY: one or two spoken sentences explaining the slide\nSRC: number\n(blank line between slides)`);
  const slides: Slide[] = tidy(t).split(/\n(?=\s*(?:#+\s*)?(?:Slide\s*\d+\s*[:.\-]?\s*)?TITLE\s*:)/i).map((b) => {
    const title = b.match(/TITLE:\s*(.+)/i)?.[1]?.trim();
    if (!title) return null;
    const bullets = b.split('\n').filter((l) => /^\s*[-*•]\s+/.test(l)).map((l) => l.replace(/^\s*[-*•]\s+/, '').trim()).slice(0, 5);
    return { title, bullets, narration: (b.match(/SAY:\s*(.+)/i)?.[1] || bullets.join('. ')).replace(/\[\d+\]/g, '').trim(), src: [...new Set([...refs(b), ...(b.match(/SRC:\s*([\d,\s]+)/i)?.[1] || '').split(/[,\s]+/).filter(Boolean).map(Number)])] };
  }).filter(Boolean) as Slide[];
  if (!slides.length) throw new Error('The model did not make slides in the expected format. Try again.');
  return { ...base, slides };
}


// ---------------------------------------------------------------- podcast episodes
export type PodcastLength = 'short' | 'medium' | 'long';
export type PodcastStyle = 'casual' | 'deep' | 'debate' | 'interview' | 'beginner' | 'news';
export interface PodcastOptions { prompt: string; length?: PodcastLength; minutes?: number; hosts?: 1 | 2 | 3; style: PodcastStyle; research: boolean; funFacts?: boolean; title?: string }

const STYLE_TEXT: Record<PodcastStyle, string> = {
  casual: 'friendly and relaxed, like two friends chatting',
  deep: 'a deep dive: careful, detailed, connecting ideas',
  debate: 'a friendly debate: the hosts take different sides and weigh the evidence',
  interview: 'an interview: A is the interviewer, B is the expert guest',
  beginner: 'for complete beginners: simple words, everyday examples, no jargon',
  news: 'a friendly daily news show: story by story, each explained simply with why it matters, upbeat but accurate',
};
const SEGMENTS: Record<PodcastLength, number> = { short: 2, medium: 3, long: 5 };

/** Extra research: offline library (Kiwix) first, then the web when online and not in off-grid mode. */
async function researchSources(query: string, startN: number, onStep: (m: string) => void): Promise<Source[]> {
  const out: Source[] = [];
  try {
    onStep('Researching the offline library...');
    const { searchLibrary, readArticle } = require('../atlasTools/offlineLibrary');
    const hits = await searchLibrary(query, 3);
    for (const h of hits.slice(0, 2)) {
      try {
        const a = await readArticle(h.uri, h.path, 900);
        out.push({ n: startN + out.length, doc: `${h.library}: ${a.title}`, part: 1, text: a.text.replace(/\s+/g, ' ').slice(0, 800), origin: 'library' });
      } catch { /* skip */ }
    }
  } catch { /* no library */ }
  try {
    const { offGridOn } = require('../atlasTools/offGrid');
    if (!offGridOn()) {
      onStep('Researching the web...');
      const { searchWeb } = require('../services/tools/webSearchProviders');
      const r = await searchWeb(query, (q: string) => require('../services/tools/handlers').braveSearch(q));
      for (const w of r.results.slice(0, 3)) {
        if (!w.snippet) continue;
        out.push({ n: startN + out.length, doc: w.title, part: 1, text: w.snippet.slice(0, 600), origin: 'web', url: w.url });
      }
    }
  } catch { /* offline */ }
  return out;
}

/**
 * Makes a podcast episode in steps (plan, then each segment) so it can be longer than the
 * model's memory: from the project sources, an optional prompt and optional extra research.
 */
export async function generatePodcast(projectId: string, opts: PodcastOptions, onStep: (m: string) => void = () => undefined): Promise<StudyResult> {
  onStep('Reading your sources...');
  // With extra research on, leave room in the model's memory for the research sources.
  let sources = await gatherSources(projectId, opts.prompt, opts.research ? 0.6 : 1);
  if (opts.research) {
    const extra = await researchSources(opts.prompt || sources.map((x) => x.doc).slice(0, 2).join(' '), sources.length + 1, onStep);
    sources = trimSources([...sources, ...extra]);
  }
  if (!sources.length) throw new Error('No sources: add documents to this project, or turn on extra research.');
  return writeEpisode(sources, opts, onStep);
}

/** Writes the episode script from ready-made sources (projects, the daily briefing, ...). */
export async function writeEpisode(sources: Source[], opts: PodcastOptions, onStep: (m: string) => void = () => undefined): Promise<StudyResult> {
  const S = `SOURCES:\n${sourceBlock(sources)}\n\n`;
  // About 1.5 minutes of speech per written part (10 lines of ~25 words).
  const minutes = opts.minutes ?? (opts.length === 'short' ? 3 : opts.length === 'long' ? 10 : 6);
  const nSeg = Math.max(1, Math.min(16, Math.round(minutes / 1.5)));
  const hosts = opts.hosts ?? 2;
  const cast = hosts === 1
    ? 'ONE narrator (A) speaking alone, like a solo podcast'
    : hosts === 3
      ? 'THREE hosts: A (curious host), B (explains), C (adds practical tips and examples)'
      : 'TWO hosts: A (curious, asks questions) and B (explains)';
  const fmt = hosts === 1 ? 'A: ...' : hosts === 3 ? 'A: ...\nB: ...\nC: ...' : 'A: ...\nB: ...';
  const style = STYLE_TEXT[opts.style];

  onStep('Planning the episode...');
  const plan = await ask(
    'You plan podcast episodes based only on the given sources.',
    `${S}${opts.prompt ? `The listener asked for: ${opts.prompt}\n` : 'Pick the most interesting angle in these sources yourself.\n'}Style: ${style}. Length: about ${minutes} minutes, in ${nSeg} parts.\nReply exactly:\nTITLE: catchy episode title\n${Array.from({ length: nSeg }, (_, i) => `SEGMENT ${i + 1}: one-line topic`).join('\n')}`,
  );
  const P = plan.replace(/\*\*|__/g, '');
  const title = opts.title || (P.match(/TITLE\s*:\s*(.+)/i)?.[1] || opts.prompt || 'Episode').replace(/["*]/g, '').trim();
  const segs = Array.from({ length: nSeg }, (_, i) => P.match(new RegExp(`(?:SEGMENT|PART)\\s*${i + 1}\\s*[:.)\\-–]\\s*(.+)`, 'i'))?.[1]?.replace(/["*]/g, '').trim()).filter(Boolean) as string[];
  const topics = segs.length ? segs : [opts.prompt || 'the main ideas'];
  // Keep the asked-for length even if the plan came back short.
  while (topics.length < nSeg) topics.push(topics.length === nSeg - 1 ? 'key takeaways and wrap-up' : `more about ${topics[topics.length % Math.max(1, segs.length)] || 'the topic'}`);

  const lines: PodcastLine[] = [];
  const parse = (t: string) => t.split('\n').map((l) => {
    const m = l.match(LINE_RE);
    if (!m) return null;
    const h = m[1].toUpperCase() as 'A' | 'B' | 'C';
    const text = m[2].replace(/\[\d+\]|\*/g, '').trim();
    return text ? { host: hosts === 1 ? 'A' : hosts === 2 && h === 'C' ? 'B' : h, text } : null;
  }).filter(Boolean) as PodcastLine[];

  for (let i = 0; i < topics.length; i++) {
    onStep(`Writing part ${i + 1} of ${topics.length}...`);
    const recap = lines.slice(-2).map((l) => `${l.host}: ${l.text}`).join('\n');
    const where = topics.length === 1 ? 'This is the WHOLE episode: A welcomes listeners and introduces the title, the topic is covered, then a short wrap-up and goodbye.' : i === 0 ? 'This is the START: A welcomes listeners and introduces the episode title.' : i === topics.length - 1 ? 'This is the LAST part: finish the topic, then wrap up with a short summary and goodbye.' : 'This is the MIDDLE: continue naturally from the last lines.';
    const t = await ask(
      'You write natural podcast scripts. Facts must come only from the sources. Never mention source numbers in the script.',
      `${S}Episode: "${title}". Style: ${style}. Cast: ${cast}.\nThis part is about: ${topics[i]}\n${where}\n${opts.funFacts ? 'End this part with one short fun fact related to it, introduced as a fun fact. Use only facts you are sure are true.\n' : ''}${recap ? `Last lines so far:\n${recap}\n` : ''}Write about 10 lines (each 1-3 sentences), one line each, exactly in this format:\n${fmt}`,
    );
    lines.push(...parse(t));
  }
  if (lines.length < 4) throw new Error('The model did not write the conversation in the expected format. Try again or use a bigger model.');
  return { kind: 'podcast', createdAt: Date.now(), topic: opts.prompt, title, sources, podcast: lines, hosts };
}
