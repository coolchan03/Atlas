/**
 * Action items from a recorded conversation. Code does the finding: it reads each sentence for a promise ("I'll send the report"), a request
 * ("can you book the room"), a shared duty ("we need to") or a marked item ("action item", "don't forget"), works out who it falls to from
 * who said it, and reads a day out of it ("by Friday", "tomorrow", "next week"). No model is involved, so it is instant, works off-grid and
 * never invents a task nobody said. Pure; the clock is passed in.
 */
import type { Utterance } from './transcript';
import { speakerName } from './transcript';

export interface ActionItem { id: string; owner: string; text: string; due?: number; heard: string }

const DAY = 864e5;
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

type Kind = 'self' | 'other' | 'everyone' | 'marked';
const CUES: Array<[Kind, RegExp, RegExp]> = [
  ['self', /\b(i'?ll|i will|i'?m going to|i am going to|i can (?:take|do|send|handle)|let me)\b/i, /^(?:okay|ok|so|yeah|yes|and|then|well|right)?[ ,]*(?:i'?ll|i will|i'?m going to|i am going to|let me)\s+/i],
  ['other', /\b(can you|could you|would you|will you|please|you need to|you should|you'?ll need to|you have to)\b/i, /^(?:okay|ok|so|yeah|and|then|well|right)?[ ,]*(?:can you|could you|would you|will you|please|you need to|you should|you'?ll need to|you have to)\s+/i],
  ['everyone', /\bwe (?:need to|should|have to|must|will|'ll)\b|\bwe'?ll\b/i, /^(?:okay|ok|so|yeah|and|then|well|right)?[ ,]*we(?:'ll| need to| should| have to| must| will)\s+/i],
  ['marked', /\b(action item|to-?do|follow up|follow-up|deadline|don'?t forget|do not forget|remember to|make sure)\b/i, /^$/],
];
// A sentence that only wonders, hedges or refuses is not a task.
const NOT_A_TASK = /\b(i'?ll think|i will think|maybe|i guess|not sure|if i have time|i don'?t know|we'?ll see)\b/i;

/** Sentences of a turn. */
const sentences = (text: string): string[] => text.split(/(?<=[.?!])\s+/).map((s) => s.trim()).filter(Boolean);

/** Midnight-based date at 9:00 for a day offset from `now`. */
const nineOn = (now: number, days: number): number => { const d = new Date(now + days * DAY); d.setHours(9, 0, 0, 0); return d.getTime(); };

/** The day a sentence names, counted from when it was said, as a time (9:00 that day, or the clock time given), or undefined. It can be in the past when the recording is old. */
function dueFrom(sentence: string, now: number): number | undefined {
  const s = sentence.toLowerCase();
  let when: number | undefined;
  const today = new Date(now).getDay();
  const named = /\b(?:on|by|before|this|next)?\s*(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/.exec(s);
  const inN = /\bin (\d{1,2}) (days?|weeks?)\b/.exec(s);
  if (/\btomorrow\b/.test(s)) when = nineOn(now, 1);
  else if (/\b(today|tonight|this evening|this afternoon)\b/.test(s)) when = nineOn(now, 0);
  else if (inN) when = nineOn(now, Number(inN[1]) * (inN[2].startsWith('w') ? 7 : 1));
  else if (named) { const ahead = (WEEKDAYS.indexOf(named[1]) - today + 7) % 7; when = nineOn(now, ahead === 0 ? 7 : ahead); }
  else if (/\b(end of (?:the |this )?week|by the weekend)\b/.test(s)) when = nineOn(now, ((5 - today + 7) % 7) || 7);
  else if (/\bnext week\b/.test(s)) when = nineOn(now, 7);
  else if (/\bnext month\b/.test(s)) when = nineOn(now, 30);
  if (when === undefined) return undefined;
  const clock = /\bat (\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/.exec(s);
  if (clock) {
    let hour = Number(clock[1]);
    if (clock[3]) hour = (hour % 12) + (clock[3] === 'pm' ? 12 : 0);
    else if (hour >= 1 && hour <= 7) hour += 12;
    if (hour < 24) { const d = new Date(when); d.setHours(hour, Number(clock[2] ?? 0), 0, 0); when = d.getTime(); }
  }
  return when;
}

const sentenceCase = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** The task as an instruction: the promise or request words are taken off the front ("I'll send the report" becomes "Send the report"). */
function asTask(sentence: string, strip: RegExp): string {
  const body = sentence.replace(strip, '').replace(/[?!.]+$/, '').replace(/^(?:also|then|and)\s+/i, '').trim();
  return sentenceCase(body);
}

/** Who a request falls to: the nearest other person talking after the speaker, or before. */
function otherPerson(utterances: Utterance[], at: number, names: Record<number, string> | undefined): string {
  const me = utterances[at].speaker;
  const next = utterances.slice(at + 1).find((u) => u.speaker !== me) ?? [...utterances.slice(0, at)].reverse().find((u) => u.speaker !== me);
  return next ? speakerName(names, next.speaker) : 'Someone';
}

/** Every promise, request and marked item in the recording, once each, in the order they were said. */
export function findActionItems(utterances: Utterance[], names: Record<number, string> | undefined, now: number): ActionItem[] {
  const out: ActionItem[] = [];
  const seen = new Set<string>();
  utterances.forEach((u, i) => {
    for (const heard of sentences(u.text)) {
      if (NOT_A_TASK.test(heard) || heard.split(/\s+/).length < 4 || heard.split(/\s+/).length > 45) continue;
      const cue = CUES.find(([, test]) => test.test(heard));
      if (!cue) continue;
      const [kind, , strip] = cue;
      const text = asTask(heard, strip);
      const key = text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const owner = kind === 'self' ? speakerName(names, u.speaker) : kind === 'other' ? otherPerson(utterances, i, names) : kind === 'everyone' ? 'Everyone' : 'Someone';
      out.push({ id: `a${out.length}`, owner, text, due: dueFrom(heard, now), heard });
    }
  });
  return out;
}

/** The list as plain text, to share or keep. */
export function actionItemsText(title: string, items: ActionItem[]): string {
  const day = (t: number) => new Date(t).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  return `Action items: ${title}\n\n${items.map((a) => `- [ ] ${a.text} (${a.owner}${a.due ? `, by ${day(a.due)}` : ''})`).join('\n')}\n`;
}
