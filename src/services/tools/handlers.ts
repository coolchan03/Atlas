import { randomNumber, rollDice } from './randomTool';
import { Platform } from 'react-native';
import { runStudyTool } from '../../study/studyTools';
import { noteStage } from '../../atlasTools/stageTimes';
import DeviceInfo from 'react-native-device-info';
import { ToolCall, ToolResult } from './types';
import type { RagSearchResult } from '../rag';
import logger from '../../utils/logger';
import { searchWeb } from './webSearchProviders';
import { libraryToolAnswer } from '../../atlasTools/offlineLibrary';
import * as DT from '../../atlasTools/deviceTools';
import { NETWORK_TOOLS, offGridOn } from '../../atlasTools/offGridState';
import { arg, requireString, EMPTY_WRITE } from './toolArgs';
import { braveSearch } from './braveSearch';
import { addSource, findUpdates, resolverFor } from '../../standards/updates';
import { caseStatus } from '../../standards/caseStatus';
import { profileFor } from '../../standards/profiles';
export { braveSearch };
import { forceHttps, isBlockedUrl } from './urlSafety';
import { evaluateExpression } from '../../utils/arithmetic';

function makeResult(call: ToolCall, start: number, opts: { content: string; error?: string }): ToolResult {
  const durationMs = Date.now() - start;
  noteStage('tools', durationMs);
  return { toolCallId: call.id, name: call.name, content: opts.content, error: opts.error, durationMs };
}

export async function executeToolCall(call: ToolCall): Promise<ToolResult> {
  const start = Date.now();
  try {
    const content = await dispatchTool(call);
    return makeResult(call, start, { content });
  } catch (error: any) {
    logger.error(`[Tools] Error executing ${call.name}:`, error);
    return makeResult(call, start, { content: '', error: error.message || 'Tool execution failed' });
  }
}

async function dispatchTool(call: ToolCall): Promise<string> {
  // Off-grid mode is enforced here, where tools actually run, not only when a
  // chat builds its tool list (remote providers, learning and other callers too).
  if (call.signal?.aborted) throw new Error(`The "${call.name}" tool was cancelled before it ran.`);
  if (NETWORK_TOOLS.includes(call.name) && offGridOn()) {
    return 'Off-grid mode is on, so internet tools are off. Answer from the offline library and what you know, and say the answer was not checked online.';
  }
  switch (call.name) {
    case 'web_search': {
      const q = requireString(call, 'query');
      if (!q) throw new Error('Missing required parameter: query');
      return handleWebSearch(q);
    }
    case 'calculator':
      return handleCalculator(call.arguments.expression);
    case 'random_number':
      return randomNumber(call.arguments as Record<string, unknown>);
    case 'roll_dice':
      return rollDice(call.arguments as Record<string, unknown>);
    case 'find_image':
    case 'study_helpers':
    case 'study_math':
    case 'science_data':
      return runStudyTool(call.name, call.arguments as Record<string, unknown>);
    case 'get_current_datetime':
      return handleGetDatetime(call.arguments.timezone);
    case 'get_device_info':
      return handleGetDeviceInfo(call.arguments.info_type);
    case 'search_knowledge_base': {
      const q = requireString(call, 'query');
      if (!q) throw new Error('Missing required parameter: query');
      return handleSearchKnowledgeBase(q, call.context?.projectId);
    }
    case 'update_project_document': {
      const name = requireString(call, 'name');
      const content = requireString(call, 'content');
      if (!name || !content) throw new Error('Missing required parameter: name and content');
      return handleUpdateProjectDocument({ name, content, mode: call.arguments?.mode, projectId: call.context?.projectId, signal: call.signal });
    }
    case 'search_offline_library': {
      const q = requireString(call, 'query');
      if (!q) throw new Error('Missing required parameter: query');
      return libraryToolAnswer(q);
    }
    case 'list_files':
      return DT.listFiles(call.arguments?.path);
    case 'read_file': {
      const p = requireString(call, 'path');
      if (!p) throw new Error('Missing required parameter: path');
      return DT.readFile(p, Number(call.arguments?.offset) || 0);
    }
    case 'write_file': {
      const p = requireString(call, 'path');
      if (!p) throw new Error('Missing required parameter: path');
      const body = arg(call, 'content');
      if (typeof body !== 'string' || !body.trim()) return EMPTY_WRITE;
      return DT.writeFile(p, body, call.arguments?.append === true || call.arguments?.append === 'true');
    }
    case 'create_web_page':
      return DT.createWebPage(String(call.arguments?.name ?? 'site'), String(call.arguments?.html ?? ''));
    case 'open_file': {
      const p = requireString(call, 'path');
      if (!p) throw new Error('Missing required parameter: path');
      return DT.openFile(p);
    }
    case 'calendar_events':
      return DT.calendarEvents(Math.max(1, parseInt(String(call.arguments?.days_ahead ?? 7), 10) || 7), Math.max(0, parseInt(String(call.arguments?.days_back ?? 0), 10) || 0));
    case 'add_calendar_event':
      return DT.addCalendarEvent(String(call.arguments?.title ?? 'Event'), String(call.arguments?.start ?? ''), { end: call.arguments?.end, location: call.arguments?.location ?? '' });
    case 'draft_message': {
      const kind = String(call.arguments?.kind ?? 'text');
      const body = String(call.arguments?.body ?? '');
      if (kind !== 'call' && !body.trim()) throw new Error('Missing required parameter: body');
      return DT.draftMessage(kind, body, { to: String(call.arguments?.to ?? ''), subject: String(call.arguments?.subject ?? '') });
    }
    case 'work_in_steps': {
      const job = requireString(call, 'job');
      if (!job) throw new Error('Missing required parameter: job');
      const named = String(call.arguments?.skill ?? '').trim().toLowerCase().replace(/^\//, '');
      if (!named) return require('../../workflows/autoSteps').workInSteps(job, String(call.arguments?.text ?? ''));
      // A skill the user installed, done one of its steps at a time.
      const skill = require('../../skills/skillsStore').useSkills.getState().skills.find((s: { name: string; enabled: boolean }) => s.enabled && s.name === named);
      const steps: string[] = skill ? require('../../skills/skillSteps').skillSteps(skill.body) : [];
      if (!skill) throw new Error(`There is no skill called "${named}" that is switched on.`);
      if (steps.length < 2) throw new Error(`The "${named}" skill is not written as steps, so it cannot be done in steps.`);
      return require('../../workflows/autoSteps').workInSteps(job, String(call.arguments?.text ?? ''), { summary: skill.description, steps, resources: skill.resources });
    }
    case 'make_helper': {
      const { saveHelperFromTool } = require('../../workflows/helperFromTool');
      return saveHelperFromTool({ title: String(call.arguments?.title ?? ''), steps: String(call.arguments?.steps ?? ''), summary: String(call.arguments?.summary ?? '') });
    }
    case 'schedule_task': {
      const { createScheduledTask } = require('../../schedule/createFromTool');
      const saved: string = createScheduledTask(call.arguments ?? {});
      if (!saved.startsWith('Saved the schedule')) return saved; // something was missing: nothing was saved, so nothing is claimed
      const { checkReminders, notificationNote } = require('../../schedule/alarms');
      return `${saved} ${notificationNote(await checkReminders())}`;
    }
    case 'learned_knowledge': {
      const q = requireString(call, 'question');
      if (!q) throw new Error('Missing required parameter: question');
      return require('../../learning/askLearned').askLearned(q, call.context?.projectId);
    }
    case 'standards_check':
    case 'source_updates':
    case 'add_source':
    case 'case_status':
      return handleStandardsTool(call);
    case 'drug_label': {
      const name = requireString(call, 'name');
      if (!name) throw new Error('Missing required parameter: name');
      return require('../../drugs/store').drugLabelsForChat(name);
    }
    case 'make_music':
      return require('../../music/composerAgent').makeMusicForChat(call.arguments ?? {});
    case 'list_maps':
      return require('../../atlasMaps/mapQuery').describeMaps();
    case 'map_places': {
      const num = (v: unknown) => (v === undefined || v === null || String(v).trim() === '' ? undefined : Number(v));
      return require('../../atlasMaps/mapQuery').placesNear({
        query: typeof call.arguments?.query === 'string' ? call.arguments.query : '', lat: num(call.arguments?.lat), lon: num(call.arguments?.lon),
        radiusKm: num(call.arguments?.radius_km), limit: num(call.arguments?.limit),
      });
    }
    case 'my_location': {
      const M = require('../../atlasMaps/maps');
      let fix = M.useMaps.getState().lastFix;
      try {
        const { NativeModules } = require('react-native');
        const fresh = await NativeModules.AtlasDevice?.lastLocation?.();
        if (fresh && (!fix || fresh.time > fix.time)) fix = fresh;
      } catch { /* no permission yet */ }
      const imperial = M.useMaps.getState().imperial;
      const places = M.useMaps.getState().waypoints;
      if (!fix) return `No GPS position yet. Ask the user to open the Maps screen (Home > Maps) and allow location; GPS works without internet.${places.length ? ` Saved places: ${places.map((w: any) => `${w.name} (${M.fmtCoord(w.lat, w.lon)})`).join('; ')}` : ''}`;
      const age = Math.round((Date.now() - fix.time) / 60000);
      const lines = ['Known: the coordinates, the saved places below, and the nearest large cities (a built-in list, not every town). Do not name airports, roads or landmarks you were not given; for a small town, say the user is near the closest city.', `Position: ${M.fmtCoord(fix.lat, fix.lon)} (decimal ${fix.lat.toFixed(6)}, ${fix.lon.toFixed(6)}), accuracy about ${M.fmtDistance(fix.accuracy, imperial)}, ${age <= 1 ? 'just now' : `${age} minutes ago`}.`];
      if (fix.altitude > -99999) lines.push(`Altitude: ${imperial ? `${Math.round(fix.altitude * 3.28084)} ft` : `${Math.round(fix.altitude)} m`}.`);
      const spot = require('../../atlasMaps/whereAmI').describePlace(fix.lat, fix.lon);
      if (spot) lines.push(`Nearest cities: the user is ${spot.sentence}.`);
      for (const w of places.slice(0, 20)) {
        const b = M.bearingDeg(fix, w);
        lines.push(`${w.name}: ${M.fmtDistance(M.distanceM(fix, w), imperial)} to the ${M.compassName(b)} (bearing ${Math.round(b)}° from true north).`);
      }
      return lines.join('\n');
    }
    case 'remember': {
      const f = requireString(call, 'fact');
      if (!f) throw new Error('Missing required parameter: fact');
      return DT.rememberFact(f);
    }
    case 'read_url': {
      const url = requireString(call, 'url');
      if (!url) throw new Error('Missing required parameter: url');
      // If a file on the phone was just read, double-check before anything is sent to the web.
      if (Date.now() - DT.lastFileRead < 10 * 60 * 1000) {
        const ok = await DT.confirm('Open this web page?', `The assistant read a file on your phone and now wants to open:\n\n${url.slice(0, 300)}\n\nOnly allow this if you expected it (a web page could try to trick the assistant into sending your file's contents).`, 'Open');
        if (!ok) return 'The user declined to open this page.';
      }
      return handleReadUrl(url, 4000, call.signal);
    }
    default:
      throw new Error(`Unknown tool: ${call.name}`);
  }
}

async function handleWebSearch(query: string): Promise<string> {
  // Atlas: provider chosen on the Tools screen (SearXNG, DuckDuckGo, Exa, Parallel, Tavily, Brave).
  const { results, provider, notes } = await searchWeb(query, braveSearch);
  if (results.length === 0) {
    // Every provider failed: report it as a failure so the model says it could not
    // search, instead of treating it as "nothing exists" (audit C7).
    const failed = notes.filter((n) => !/: no results$/.test(n));
    if (failed.length && failed.length === notes.length) throw new Error(`Search failed (offline or blocked): ${failed.join('; ')}`);
    return `No results found for "${query}".`;
  }
  return `Results from ${provider}:\n\n${results
    .map((r, i) => {
      const heading = r.url ? `[${r.title}](${r.url})` : r.title;
      return `${i + 1}. ${heading}\n   ${r.snippet}`;
    })
    .join('\n\n')}`;
}


/**
 * Safe math expression evaluator using recursive descent parsing.
 * Supports: +, -, *, /, %, ^ (exponentiation), parentheses, decimals.
 * No dynamic code execution (no eval/new Function).
 */

function handleCalculator(expression: string): string {
  const sanitized = expression.replaceAll(/\s/g, '');
  if (!/^[0-9+\-*/().,%^]+$/.test(sanitized)) {
    throw new Error('Invalid expression: only numbers and basic operators (+, -, *, /, ^, %, parentheses) are allowed');
  }

  const result = evaluateExpression(sanitized);

  if (typeof result !== 'number' || !Number.isFinite(result)) {
    throw new TypeError('Expression did not evaluate to a finite number');
  }

  return `${expression} = ${result}`;
}

function handleGetDatetime(timezone?: string): string {
  const now = new Date();
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'long',
    ...(timezone ? { timeZone: timezone } : {}),
  };
  try {
    const formatted = new Intl.DateTimeFormat('en-US', options).format(now);
    const isoString = now.toISOString();
    return `Current date and time: ${formatted}\nISO 8601: ${isoString}\nUnix timestamp: ${Math.floor(now.getTime() / 1000)}`;
  } catch {
    // Invalid timezone fallback
    const formatted = now.toString();
    return `Current date and time: ${formatted}\nNote: requested timezone "${timezone}" was invalid, showing device local time.`;
  }
}

async function collectDeviceSection(
  label: string, fetcher: () => Promise<string>,
): Promise<string> {
  try { return await fetcher(); } catch { return `${label}: unavailable`; }
}

async function handleGetDeviceInfo(infoType = 'all'): Promise<string> {
  const type = infoType;
  const parts: string[] = [];

  if (type === 'all' || type === 'memory') {
    parts.push(await collectDeviceSection('Memory', async () => {
      const total = await DeviceInfo.getTotalMemory();
      const used = await DeviceInfo.getUsedMemory();
      return `Memory:\n  Total: ${formatBytes(total)}\n  Used: ${formatBytes(used)}\n  Available: ${formatBytes(total - used)}`;
    }));
  }

  if (type === 'all' || type === 'storage') {
    parts.push(await collectDeviceSection('Storage', async () => {
      const free = await DeviceInfo.getFreeDiskStorage();
      const total = await DeviceInfo.getTotalDiskCapacity();
      return `Storage:\n  Total: ${formatBytes(total)}\n  Free: ${formatBytes(free)}`;
    }));
  }

  if (type === 'all' || type === 'battery') {
    parts.push(await collectDeviceSection('Battery', async () => {
      const level = await DeviceInfo.getBatteryLevel();
      const charging = await DeviceInfo.isBatteryCharging();
      return `Battery: ${Math.round(level * 100)}%${charging ? ' (charging)' : ''}`;
    }));
  }

  if (type === 'all') {
    parts.push(
      `Device: ${DeviceInfo.getBrand()} ${DeviceInfo.getModel()}`,
      `OS: ${Platform.OS} ${DeviceInfo.getSystemVersion()}`,
    );
  }

  return parts.join('\n\n');
}

/** Block SSRF: reject private/loopback/link-local/cloud-metadata URLs. */
function nodeToText(node: any): string {
  if (node.nodeType === 3) return node.text ?? '';
  const tag = (node.tagName ?? '').toLowerCase();
  const skip = ['script','style','nav','header','footer','aside','noscript','iframe','form','button','figure','picture','img','video','audio','svg','canvas'];
  if (skip.includes(tag)) return '';
  const children = (node.childNodes ?? []).map(nodeToText).join('');
  if (['h1','h2','h3'].includes(tag)) return `\n\n## ${children.trim()}\n`;
  if (tag === 'h4' || tag === 'h5' || tag === 'h6') return `\n\n### ${children.trim()}\n`;
  if (tag === 'p') return `\n\n${children.trim()}`;
  if (tag === 'li') return `\n- ${children.trim()}`;
  if (tag === 'br') return '\n';
  if (tag === 'blockquote') return `\n> ${children.trim()}\n`;
  if (tag === 'code' || tag === 'pre') return `\`${children.trim()}\``;
  return children;
}

function htmlToMarkdown(html: string): string {
  const { parse } = require('node-html-parser'); // NOSONAR
  const root = parse(html);

  // strip boilerplate
  ['script','style','nav','header','footer','aside','noscript','iframe','form','button'].forEach(
    tag => root.querySelectorAll(tag).forEach((el: any) => el.remove()),
  );

  // prefer semantic content containers
  const content = root.querySelector('article')
    ?? root.querySelector('[role="main"]')
    ?? root.querySelector('main')
    ?? root.querySelector('.post-content, .article-body, .entry-content, .content')
    ?? root.querySelector('body')
    ?? root;

  return nodeToText(content)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Read a web page as plain text (used by the daily briefing too). */
export async function readPage(rawUrl: string, maxChars = 4000): Promise<string> { return handleReadUrl(rawUrl, maxChars); }

async function handleReadUrl(rawUrl: string, MAX_CHARS = 4000, signal?: AbortSignal): Promise<string> {
  // Strip surrounding quotes/angle brackets that models sometimes emit
  let url = rawUrl.trim();
  while (url.length > 0 && '"\'<> '.includes(url[0])) url = url.slice(1);
  while (url.length > 0 && '"\'<> '.includes(url[url.length - 1])) url = url.slice(0, -1);
  if (!/^https?:\/\//i.test(url)) throw new Error('Invalid URL: must start with http:// or https://');
  if (isBlockedUrl(url)) throw new Error('Blocked: cannot fetch private/local network URLs');
  url = forceHttps(url);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  signal?.addEventListener?.('abort', () => controller.abort());
  try {
    // On-device fetch + parse (privacy-preserving — no third-party proxy)
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        'Accept': 'text/html, text/plain, */*',
      },
    });
    // A public page can redirect to a private address: refuse what came from there.
    if (response.url && isBlockedUrl(response.url)) throw new Error('Blocked: the page redirected to a private or local network address');
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    const html = await response.text();
    const text = htmlToMarkdown(html);

    if (!text) return `The page at ${url} returned no readable content.`;

    return text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS)}\n\n[Content truncated]` : text;
  } catch (e: any) {
    logger.error(`[Tools] read_url FAILED for "${url}": ${e?.message || e}`);
    throw e;
  } finally { clearTimeout(timeout); }
}

async function handleSearchKnowledgeBase(query: string, projectId?: string): Promise<string> {
  if (!projectId) return 'No project context. Knowledge base requires an active project.';
  const { ragService } = require('../rag'); // NOSONAR
  const result = await ragService.searchProject(projectId, query);
  if (result.chunks.length === 0) return `No results found for "${query}" in the knowledge base.`;
  return result.chunks
    .map((c: RagSearchResult, i: number) => `[${i + 1}] ${c.name} (part ${c.position + 1}):\n${c.content}`)
    .join('\n\n---\n\n');
}

/** The names of the enabled documents in a project (empty outside a project), for comparing a found page with what is held. */
async function heldDocumentNames(projectId?: string): Promise<string[]> {
  if (!projectId) return [];
  const docs = await require('../rag').ragService.getDocumentsInScope(projectId); // NOSONAR
  return docs.filter((d: { enabled?: boolean }) => d.enabled).map((d: { name: string }) => d.name);
}

/** The tools that look at the standard-setters' and the government's own sites: the latest accounting standards, newer tax sources, and adding one to the project. */
async function handleStandardsTool(call: ToolCall): Promise<string> {
  const web = async (q: string) => (await searchWeb(q, braveSearch)).results;
  if (call.name === 'standards_check') {
    const topic = requireString(call, 'topic');
    if (!topic) throw new Error('Missing required parameter: topic');
    return require('../../standards/lookup').standardsCheck(topic, web); // NOSONAR
  }
  if (call.name === 'case_status') {
    const name = requireString(call, 'case');
    if (!name) throw new Error('Missing required parameter: case');
    return caseStatus(name, web);
  }
  const projectId = call.context?.projectId;
  const held = await heldDocumentNames(projectId);
  const proj = projectId ? require('../../stores/projectStore').useProjectStore.getState().getProject(projectId) : undefined; // NOSONAR
  const res = resolverFor(profileFor(proj?.profileId, proj?.customProfile, held));
  if (call.name === 'source_updates') {
    const source = requireString(call, 'source');
    if (!source) throw new Error('Missing required parameter: source');
    return findUpdates(source, held, { search: web, res });
  }
  const url = requireString(call, 'url');
  if (!url) throw new Error('Missing required parameter: url');
  if (!projectId) return 'This chat is not in a project, so there is nowhere to add the source.';
  return addSource(url, {
    held, res, confirm: DT.confirm, fetchPage: (u) => handleReadUrl(u, 120000, call.signal),
    save: async (name, text) => { await require('../rag').ragService.saveProjectNote({ projectId, name, text, mode: 'replace' }); }, // NOSONAR
  });
}

async function handleUpdateProjectDocument(p: { name: string; content: string; mode?: string; projectId?: string; signal?: AbortSignal }): Promise<string> {
  if (!p.projectId) return 'This chat is not in a project, so there is no shared document to update.';
  const mode = p.mode === 'replace' ? 'replace' : 'append';
  const { ragService } = require('../rag'); // NOSONAR
  if (p.signal?.aborted) throw new Error('The update was cancelled, so nothing was written.'); // no writes after a timeout or cancel
  await ragService.saveProjectNote({ projectId: p.projectId, name: p.name, text: p.content, mode });
  return `${mode === 'replace' ? 'Rewrote' : 'Added to'} the project document "${p.name}". Every chat in this project can now use it.`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return bytes < 1024 ** 3 ? `${(bytes / 1024 ** 2).toFixed(1)} MB` : `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}
