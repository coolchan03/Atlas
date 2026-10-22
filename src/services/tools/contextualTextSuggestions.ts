import { NativeModules, PermissionsAndroid, Platform } from 'react-native';
import * as DT from '../../atlasTools/deviceTools';

/** Suggestion-only context connector. Never looks up contacts or sends messages. */
export interface CalendarEvent {
  title: string; begin: number; end?: number; location?: string; allDay?: boolean;
}
export interface ContactIdea {
  event: string; date: string; reason: string; suggestedDraft: string; name?: string;
}
type Kind = 'birthday' | 'anniversary' | 'celebration' | 'plan';
function kindOf(title: string): Kind | null {
  if (/\bbirthdays?\b/i.test(title)) return 'birthday';
  if (/\banniversar(?:y|ies)\b/i.test(title)) return 'anniversary';
  if (/\b(graduation|wedding|engagement|baby shower|celebration)\b/i.test(title)) return 'celebration';
  if (/\b(lunch|dinner|coffee|meet(?:ing|up)?|hangout|date night|visit|party|reunion|game night)\b/i.test(title)) return 'plan';
  return null;
}
function eventPerson(title: string, kind: Kind): string | undefined {
  const candidate = kind === 'birthday' || kind === 'anniversary'
    ? (title.match(new RegExp("^(.+?)(?:'s|’s)?\\s+" + kind, 'i'))?.[1] ||
       title.match(new RegExp("^" + kind + "(?:\\s+of|\\s+for|:)?\\s+(.+)$", 'i'))?.[1])
    : undefined;
  const name = String(candidate || '').replace(/^(my|the)\s+/i, '').trim();
  if (!name || name.length > 48 || /\b(party|meeting|appointment)\b/i.test(name)) return undefined;
  return name;
}
export function generateContactIdeas(
  events: CalendarEvent[],
  opts: { now?: number; days?: number; person?: string; topic?: string } = {},
): ContactIdea[] {
  const now = opts.now ?? Date.now();
  const days = Math.max(1, Math.min(14, opts.days ?? 7));
  const person = opts.person?.trim();
  const topic = opts.topic?.trim();
  const seen = new Set<string>();
  const ideas: ContactIdea[] = [];
  for (const ev of [...events].sort((a, b) => a.begin - b.begin)) {
    if (!ev || typeof ev.title !== 'string' || !Number.isFinite(ev.begin) ||
        ev.begin < now - 3600000 || ev.begin > now + days * 86400000) continue;
    const kind = kindOf(ev.title);
    if (!kind) continue;
    const name = eventPerson(ev.title, kind);
    if (person && !ev.title.toLowerCase().includes(person.toLowerCase()) &&
        name?.toLowerCase() !== person.toLowerCase()) continue;
    if (topic && !ev.title.toLowerCase().includes(topic.toLowerCase()) &&
        !kind.includes(topic.toLowerCase())) continue;
    const key = ev.title.toLowerCase() + ':' + new Date(ev.begin).toDateString();
    if (seen.has(key)) continue;
    seen.add(key);
    const date = new Date(ev.begin).toLocaleString(undefined, ev.allDay
      ? { month: 'short', day: 'numeric' }
      : { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    const greeting = name || person;
    const opening = greeting ? 'Hi ' + greeting + ', ' : 'Hi, ';
    const reason = kind === 'birthday' ? 'A birthday is on your calendar for ' + date
      : kind === 'anniversary' ? 'An anniversary is on your calendar for ' + date
      : kind === 'celebration' ? 'A celebration is coming up on ' + date
      : 'A social plan is on your calendar for ' + date;
    const suggestedDraft = kind === 'birthday'
      ? opening + 'happy birthday! Hope you have a great day.'
      : kind === 'anniversary' ? opening + 'happy anniversary! Thinking of you today.'
      : kind === 'celebration' ? opening + 'congratulations! Wishing you all the best.'
      : opening + "just checking that we're still on for " + ev.title +
        ' on ' + date + '. Looking forward to it!';
    ideas.push({ event: ev.title.slice(0, 120), date, reason, suggestedDraft, name: greeting });
    if (ideas.length >= 5) break;
  }
  return ideas;
}
export async function suggestContextualTexts(opts: {
  person?: string; topic?: string; days?: number;
} = {}): Promise<string> {
  if (Platform.OS !== 'android' || !NativeModules.AtlasDevice?.calendarEvents) {
    return 'Calendar-based text suggestions require the Atlas Android app.';
  }
  const days = Math.max(1, Math.min(14, Math.floor(Number(opts.days ?? 7))));
  const approved = await DT.confirm('Suggest messages from your calendar?',
    'Look for social occasions over the next ' + days + ' days' +
    (opts.person ? ' relating to ' + opts.person : '') +
    '? Atlas will only suggest drafts in this conversation. No contacts are scanned or messages sent.',
    'Suggest');
  if (!approved) return 'The user declined calendar-based suggestions.';
  const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_CALENDAR);
  if (granted !== PermissionsAndroid.RESULTS.GRANTED) return 'Calendar permission denied.';
  const now = Date.now();
  const raw: CalendarEvent[] = await NativeModules.AtlasDevice.calendarEvents(now, now + days * 86400000);
  const ideas = generateContactIdeas(raw || [], { now, days, person: opts.person, topic: opts.topic });
  if (!ideas.length) return 'No clear birthday, anniversary, celebration, or social plan was found. Do not invent events or recipients.';
  return 'Possible messages based on your actual calendar events (suggestions only):\n\n' +
    ideas.map((idea, i) => (i + 1) + '. Event: ' + idea.event + ' (' + idea.date + ')' +
      '\nReason: ' + idea.reason + '\nPossible text: "' + idea.suggestedDraft + '"').join('\n\n') +
    '\n\nAsk which idea, if any, the user wants to pursue. Confirm the recipient and phone number through find_contact (with permission) or ask directly, then open draft_text. Never send or imply anything was sent.';
}
