/**
 * Atlas learning mode: a practice loop that runs entirely on the phone with the loaded model.
 *
 *   Learner  - answers a practice question on the chosen topic (using the agent's prompt,
 *              its current lessons and, if a project is chosen, that project's knowledge base).
 *   Judge    - after every N learner reports, checks the reasoning against the sources and
 *              proposes concrete lessons.
 *   Manager  - after every M judge turns, audits the judge's findings, rewrites the agent's
 *              lesson list, and sets a short "direction" that steers the learner and the judge
 *              when things drift off course.
 *
 * Nothing is fine-tuned: the model's weights never change. What "learns" is the agent's
 * lesson list, which is added under its system prompt in every chat (and is editable).
 */
import { llmService } from '../services/llm';
import { activeModelService } from '../services/activeModelService';
import { ragService } from '../services/rag';
import { useAppStore } from '../stores/appStore';
import { useAgentStore, Agent, agentPromptWithLessons } from '../stores/agentStore';
import { useLearningStore } from './store';
import type { Message } from '../types';
import logger from '../utils/logger';

let running = false;
let stopRequested = false;
let statusListener: ((s: string) => void) | null = null;

export const isLearning = (): boolean => running;
export const onLearningStatus = (fn: ((s: string) => void) | null): void => { statusListener = fn; };
const status = (s: string) => statusListener?.(s);

const msg = (role: Message['role'], content: string): Message => ({
  id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  role,
  content,
  timestamp: Date.now(),
});

const clean = (t: string): string =>
  t.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<\/?think>/gi, '').trim();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function ensureModel(): Promise<void> {
  if (llmService.isModelLoaded()) return;
  const id = useAppStore.getState().activeModelId;
  if (!id) throw new Error('No model selected. Load a text model first (Models tab).');
  status('Loading the model...');
  await activeModelService.loadTextModel(id);
  if (!llmService.isModelLoaded()) throw new Error('The model could not be loaded.');
}

/** One model call. Waits politely if a chat is generating. */
async function ask(system: string, user: string): Promise<string> {
  for (let i = 0; llmService.isCurrentlyGenerating(); i++) {
    if (stopRequested) throw new Error('stopped');
    if (i === 0) status('Waiting for the chat to finish...');
    await sleep(1500);
  }
  await ensureModel();
  const out = await llmService.generateResponse([msg('system', system), msg('user', user)], { disableThinking: true });
  return clean(out);
}

async function sources(projectId: string, query: string): Promise<string> {
  if (!projectId) return '';
  try {
    const res: any = await ragService.searchProject(projectId, query);
    const chunks: any[] = res?.chunks || [];
    return chunks
      .slice(0, 3)
      .map((c) => `[${c.name}] ${String(c.content).slice(0, 900)}`)
      .join('\n\n');
  } catch (e) {
    logger.log(`[Learning] knowledge search failed: ${String(e)}`);
    return '';
  }
}

const linesStarting = (text: string, tag: string): string[] =>
  text
    .split('\n')
    .map((l) => l.trim().replace(/^[-*\d.)\s]+/, ''))
    .filter((l) => l.toUpperCase().startsWith(tag))
    .map((l) => l.slice(tag.length).replace(/^[:\s-]+/, '').trim())
    .filter(Boolean);

async function learnerTurn(agent: Agent, topic: string, projectId: string): Promise<void> {
  const L = useLearningStore.getState();
  const st = L.get(agent.id);
  status('Making a practice question...');
  const q = (await ask(
    'You write realistic practice questions. Output ONLY the question, one or two sentences, nothing else.',
    `Topic: ${topic}\n${st.direction ? `Focus for now: ${st.direction}\n` : ''}Write one new, specific question a person in a real situation might ask. Avoid these recent ones:\n${st.recentQuestions.slice(-8).join('\n') || '(none)'}`,
  )).split('\n')[0].slice(0, 300);
  if (!q) return;
  L.log({ agentId: agent.id, kind: 'question', title: 'Question', body: q });

  status('Learner is answering...');
  const ctx = await sources(projectId, q);
  const answer = await ask(
    `${agentPromptWithLessons(agent)}${st.direction ? `\n\nCurrent direction from your manager: ${st.direction}` : ''}`,
    `${ctx ? `Sources you may use:\n${ctx}\n\n` : ''}Question: ${q}\n\nAnswer it. Then add a line starting "REASONING:" explaining briefly why, and which source you used.`,
  );
  L.log({ agentId: agent.id, kind: 'report', title: 'Learner report', body: answer.slice(0, 2500) });
  const report = `Q: ${q}\nA: ${answer.slice(0, 1500)}\nSOURCES: ${ctx ? ctx.slice(0, 1200) : '(none)'}`;
  L.patch(agent.id, {
    reportsSinceJudge: st.reportsSinceJudge + 1,
    totalReports: st.totalReports + 1,
    recentQuestions: [...st.recentQuestions, q].slice(-20),
    pendingFindings: st.pendingFindings,
  });
  pendingReports.push(report);
}

let pendingReports: string[] = [];

async function judgeTurn(agent: Agent): Promise<void> {
  const L = useLearningStore.getState();
  const st = L.get(agent.id);
  status('Judge is checking the learner...');
  const verdict = await ask(
    `You are a strict but fair judge. You check another assistant's answers for wrong facts, unsafe advice, invented numbers, missing urgent steps, and answers that ignore the sources.${st.judgeNote ? `\nNote from the manager about your judging: ${st.judgeNote}` : ''}${st.direction ? `\nCurrent direction: ${st.direction}` : ''}`,
    `Reports:\n\n${pendingReports.join('\n\n---\n\n').slice(0, 6000)}\n\nFor each report give "SCORE: n/10" and one sentence why. Then write 1 to 3 lines starting "LESSON:" with a short, concrete rule the assistant should follow next time. Only lessons supported by the sources or by basic safety.`,
  );
  const lessons = linesStarting(verdict, 'LESSON');
  const nums = [...verdict.matchAll(/SCORE\s*:?\s*(\d+(?:\.\d+)?)\s*\/\s*10/gi)].map((m) => Math.min(10, parseFloat(m[1])));
  const avg = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
  L.log({ agentId: agent.id, kind: 'judge', title: `Judge (${lessons.length} lesson${lessons.length === 1 ? '' : 's'})`, body: verdict.slice(0, 2500) });
  pendingReports = [];
  L.patch(agent.id, {
    reportsSinceJudge: 0,
    judgesSinceManager: st.judgesSinceManager + 1,
    scores: avg === null ? st.scores : [...st.scores, Math.round(avg * 10) / 10].slice(-50),
    pendingFindings: [...st.pendingFindings, ...lessons, `(judge summary) ${verdict.slice(0, 400)}`].slice(-30),
  });
}

async function managerTurn(agent: Agent, topic: string): Promise<void> {
  const L = useLearningStore.getState();
  const st = L.get(agent.id);
  status('Manager is auditing...');
  const out = await ask(
    'You are the manager. You audit the judge, keep the lesson list short and correct, and steer the team back on course when it drifts. You never add lessons that are unsafe or not supported.',
    `Topic: ${topic}\nCurrent lessons:\n${agent.lessons?.trim() || '(none)'}\n\nJudge findings since your last audit:\n${st.pendingFindings.join('\n').slice(0, 5000)}\n\nPrevious direction: ${st.direction || '(none)'}\n\nReply with exactly these parts:\nLESSON: (one line each, at most 12 total, merge duplicates, drop wrong ones)\nDIRECTION: (one sentence: what the learner should focus on next)\nJUDGE NOTE: (one sentence: is the judge too harsh, too lenient, or missing something)`,
  );
  const lessons = linesStarting(out, 'LESSON').slice(0, 12);
  const direction = linesStarting(out, 'DIRECTION')[0] || st.direction;
  const judgeNote = linesStarting(out, 'JUDGE NOTE')[0] || st.judgeNote;
  if (lessons.length) {
    useAgentStore.getState().updateAgent(agent.id, { lessons: lessons.map((l) => `- ${l}`).join('\n') });
  }
  L.log({
    agentId: agent.id,
    kind: 'manager',
    title: `Manager audit: ${lessons.length} lessons kept`,
    body: `${lessons.map((l) => `- ${l}`).join('\n')}\n\nDirection: ${direction || '-'}\nJudge note: ${judgeNote || '-'}`,
  });
  L.patch(agent.id, { judgesSinceManager: 0, pendingFindings: [], direction, judgeNote });
}

/** Run until stop() is called. Errors are logged and the loop continues after a pause. */
export async function startLearning(agentId: string): Promise<void> {
  if (running) return;
  running = true;
  stopRequested = false;
  pendingReports = [];
  const L = useLearningStore.getState();
  L.log({ agentId, kind: 'info', title: 'Learning started', body: '' });
  try {
    while (!stopRequested) {
      const agent = useAgentStore.getState().getAgent(agentId);
      const cfg = useLearningStore.getState().getConfig(agentId);
      if (!agent) throw new Error('Agent not found');
      if (!cfg.topic.trim()) throw new Error('Set a topic first');
      // Several topics (one per line) are practiced in rotation.
      const topics = cfg.topic.split('\n').map((t) => t.trim()).filter(Boolean);
      const ti = useLearningStore.getState().get(agentId).topicIndex % topics.length;
      useLearningStore.getState().patch(agentId, { topicIndex: ti + 1 });
      try {
        await learnerTurn(agent, topics[ti], cfg.projectId);
        if (stopRequested) break;
        let st = useLearningStore.getState().get(agentId);
        if (st.reportsSinceJudge >= Math.max(1, cfg.reportsPerJudge) && pendingReports.length) {
          await judgeTurn(useAgentStore.getState().getAgent(agentId)!);
          st = useLearningStore.getState().get(agentId);
          if (st.judgesSinceManager >= Math.max(1, cfg.judgesPerManager) && !stopRequested) {
            await managerTurn(useAgentStore.getState().getAgent(agentId)!, topics.join('; '));
          }
        }
      } catch (e: any) {
        if (String(e?.message) === 'stopped') break;
        useLearningStore.getState().log({ agentId, kind: 'error', title: 'Problem', body: String(e?.message || e) });
        if (/No model|could not be loaded|Set a topic|not found/.test(String(e?.message))) break;
        status('Pausing after a problem...');
        await sleep(5000);
      }
    }
  } finally {
    running = false;
    stopRequested = false;
    useLearningStore.getState().log({ agentId, kind: 'info', title: 'Learning stopped', body: '' });
    status('Stopped');
  }
}

export function stopLearning(): void {
  if (!running) return;
  stopRequested = true;
  status('Stopping after this step...');
}

/** Run the manager now on whatever the judge has found so far. */
export async function auditNow(agentId: string): Promise<void> {
  const agent = useAgentStore.getState().getAgent(agentId);
  const cfg = useLearningStore.getState().getConfig(agentId);
  if (!agent || running) return;
  running = true;
  try { await managerTurn(agent, cfg.topic || 'general'); } finally { running = false; status('Idle'); }
}
