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
  // A textbook or study pack is not a blueprint: reading it as one would replace the exam's checklist with sentences from the book.
  if (!looksLikeOutline(text)) return [];
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
  // The model may only name topics the file really contains, so it cannot write its own blueprint.
  const have = new Set(significant(text));
  const grounded = areas.map((a) => ({ ...a, topics: a.topics.filter((t) => { const w = significant(t); return !w.length || w.filter((x) => have.has(x)).length / w.length >= 0.6; }) })).filter((a) => a.topics.length);
  return grounded.length ? grounded : direct;
}

/** A document that is the exam's outline or blueprint (by name): it lists what to study, so it is never used as lesson text. */
export const isOutlineDocument = (name: string): boolean => /blueprint|content[\s_-]*(?:specification|outline)|exam[\s_-]*outline|syllabus/i.test(name);

/**
 * Whether a file is an outline (a list of areas and topics) and not the subject's own text. A blueprint names itself or is made of
 * short lines; a textbook or study pack is prose, mostly lines ending in a full stop. Only an outline may replace the exam's checklist.
 */
export function looksLikeOutline(text: string): boolean {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 6) return true; // too short to be a book
  const prose = lines.filter((l) => l.length > 60 && /[.!?]$/.test(l)).length / lines.length;
  const named = /blueprint|content (?:specification|outline)|exam outline|syllabus/i.test(text.slice(0, 4000));
  return named ? prose < 0.5 : prose < 0.2;
}

const significant = (t: string): string[] => (t.toLowerCase().match(/[a-z]{4,}/g) ?? []);
