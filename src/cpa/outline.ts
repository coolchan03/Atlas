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
