// Splits text into pieces a speech engine can say in one go: whole sentences, at most `max` characters.
export function speechChunks(text: string, max = 380): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const sentences = clean.match(/[^.!?…]+[.!?…]+["')\]]*\s*|[^.!?…]+$/g) ?? [clean];
  const out: string[] = [];
  let cur = '';
  const flush = () => { if (cur.trim()) out.push(cur.trim()); cur = ''; };
  for (const s of sentences) {
    if (s.length > max) {
      flush();
      // A sentence longer than the limit is cut at commas, then at spaces.
      let rest = s;
      while (rest.length > max) {
        let cut = rest.lastIndexOf(',', max);
        if (cut < max * 0.4) cut = rest.lastIndexOf(' ', max);
        if (cut <= 0) cut = max;
        out.push(rest.slice(0, cut + 1).trim());
        rest = rest.slice(cut + 1);
      }
      cur = rest;
    } else if ((cur + s).length > max) {
      flush();
      cur = s;
    } else cur += s;
  }
  flush();
  return out.filter(Boolean);
}
