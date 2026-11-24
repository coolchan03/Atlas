/**
 * Everything you have written or said, as passages with a place to point back to: journal pages, your chats, recording transcripts and
 * trip notes. Private chats are left out. Newest first, at most MAX passages, so the search stays quick on a phone.
 */
import { useJournal } from '../journal/store';
import { useChatStore } from '../stores/chatStore';
import { useRecordings } from '../atlasRecorder/store';
import { useTrips } from '../trip/store';
import { splitIntoParts } from '../workflows/longText';

const PIECE = 700;
const MAX = 300;

export interface NotePassage { text: string; /** Where it came from, e.g. "Journal 2026-11-20". */ source: string; at: number }

const pieces = (text: string): string[] => (text.trim() ? splitIntoParts(text.trim(), PIECE) : []);

/** Collects the passages from this phone's stores. */
export function collectNotes(): NotePassage[] {
  const out: NotePassage[] = [];
  for (const e of useJournal.getState().entries) for (const p of pieces(e.text)) out.push({ text: p, source: `Journal ${e.day}`, at: Date.parse(`${e.day}T12:00:00`) || 0 });
  for (const c of useChatStore.getState().conversations) {
    if (c.isPrivate) continue;
    const said = c.messages.filter((m) => !m.isSystemInfo && (m.role === 'user' || m.role === 'assistant') && m.content.trim())
      .map((m) => `${m.role === 'user' ? 'Me' : 'AI'}: ${m.content}`).join('\n');
    const at = Date.parse(c.updatedAt) || 0;
    for (const p of pieces(said)) out.push({ text: p, source: `Chat "${c.title.slice(0, 40)}"`, at });
  }
  for (const r of useRecordings.getState().recordings) {
    if (r.status !== 'done') continue;
    const said = r.utterances?.length ? r.utterances.map((u) => u.text).join(' ') : (r.segments ?? []).map((s) => s.text).join(' ');
    const at = Date.parse(r.createdAt) || 0;
    for (const p of pieces(said)) out.push({ text: p, source: `Recording "${r.title.slice(0, 40)}"`, at });
  }
  for (const t of useTrips.getState().trips) {
    const notes = [`Trip ${t.name}: language ${t.language}, money ${t.currency}`, ...t.phrases.map((p) => `${p.text} = ${p.translation}`), `Packing: ${t.packing.map((x) => x.text).join(', ')}`].join('\n');
    for (const p of pieces(notes)) out.push({ text: p, source: `Trip "${t.name}"`, at: 0 });
  }
  return out.sort((a, b) => b.at - a.at).slice(0, MAX);
}
