/** Pasted outline to areas and topics: a line ending in a colon (or starting with # or a number and a dot) starts an area, every other line is a topic. Pure. */
export interface OutlineArea { area: string; topics: string[] }

export function parseOutline(text: string): OutlineArea[] {
  const areas: OutlineArea[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/^[\s\-*•\d.)]+/, (m) => (/^\s*\d+[.)]\s/.test(m) ? '' : m.replace(/[\-*•]/g, ''))).trim();
    if (!line) continue;
    const heading = /:\s*$/.test(line) || /^#+\s/.test(raw.trim()) || /^\s*[IVX]+\.\s/.test(raw);
    const name = line.replace(/^#+\s*/, '').replace(/:\s*$/, '').replace(/^[IVX]+\.\s*/, '').trim().slice(0, 100);
    if (!name) continue;
    if (heading || !areas.length) { areas.push({ area: heading ? name : 'Topics', topics: heading ? [] : [name] }); continue; }
    areas[areas.length - 1].topics.push(name);
  }
  return areas.filter((a) => a.topics.length);
}

export const outlineToText = (areas: OutlineArea[]): string => areas.map((a) => `${a.area}:\n${a.topics.join('\n')}`).join('\n');

/**
 * An exam's official outline, from the text of the file (a blueprint PDF, a syllabus). When the text already has areas with a colon or
 * a heading it is read in code; otherwise the AI sorts it into areas and topics, and the person checks the result before using it.
 * `ask` is the model; it is only called when the text is not already in the shape parseOutline reads.
 */
export async function outlineFromText(text: string, ask: (system: string, user: string) => Promise<string>): Promise<OutlineArea[]> {
  const direct = parseOutline(text);
  if (direct.length >= 2 && direct.reduce((n, a) => n + a.topics.length, 0) >= 6) return direct;
  const { parseJsonLoose } = require('../study/games/json');
  const raw = await ask('You turn an exam content outline into areas and topics. Output only JSON.',
    `Read this exam outline and list its content areas and, under each, its topics (short names, as the outline words them; no invented topics).\nReply with ONLY: {"areas":[{"area":"name","topics":["topic","topic"]}]}\n\nOUTLINE:\n${text.slice(0, 24000)}`);
  const json = parseJsonLoose(raw);
  const areas: OutlineArea[] = (Array.isArray(json?.areas) ? json.areas : []).map((a: any) => ({
    area: String(a?.area ?? '').trim().slice(0, 100),
    topics: (Array.isArray(a?.topics) ? a.topics : []).map((t: unknown) => String(t).trim().slice(0, 100)).filter(Boolean).slice(0, 40),
  })).filter((a: OutlineArea) => a.area && a.topics.length).slice(0, 20);
  return areas.length ? areas : direct;
}
