/**
 * Reads the phone's native calendar to surface flight numbers and travel context
 * in the daily briefing. Uses react-native-calendar-events (already installed).
 * Silently returns null if permission is denied or the module is unavailable.
 */

import { specialDays } from './dayExtras';
const AIRLINES: Record<string, string> = {
  AA: 'American', UA: 'United', DL: 'Delta', WN: 'Southwest', B6: 'JetBlue',
  AS: 'Alaska', F9: 'Frontier', NK: 'Spirit', G4: 'Allegiant', AC: 'Air Canada',
  LH: 'Lufthansa', BA: 'British Airways', AF: 'Air France', EK: 'Emirates',
  QR: 'Qatar', SQ: 'Singapore', CX: 'Cathay', JL: 'Japan Airlines', KE: 'Korean Air', TK: 'Turkish',
};

export interface CalendarFlight {
  raw: string;
  airline: string;
  number: string;
  destination?: string;
  departureTime?: Date;
}

export interface CalendarContext {
  flights: CalendarFlight[];
  travelKeywords: string[];
  eventTitles: string[];
  /** Today's events only, in time order, for reading out. */
  today?: { title: string; start?: Date; allDay?: boolean }[];
  /** Tomorrow's events, in time order (said in the evening instead of today's). */
  tomorrow?: { title: string; start?: Date; allDay?: boolean }[];
}

const TRAVEL_RE = /\b(hotel|flight|fly|depart|arrival|check[\s-]?in|conference|trip|travel|airport|train|cruise)\b/i;
const FLIGHT_RE = /\b([A-Z]{2})\s*(\d{1,4})\b/g;
const DEST_RE = /\bto\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i;

export function parseFlight(title: string, startDate: string): CalendarFlight | null {
  FLIGHT_RE.lastIndex = 0;
  const m = FLIGHT_RE.exec(title);
  if (!m) return null;
  const [, code, num] = m;
  // Two capital letters and a number is also "PR 42" or "AI 2024": count it only for a known airline, or when the title talks about travel.
  if (!(code in AIRLINES) && !TRAVEL_RE.test(title)) return null;
  const destMatch = title.match(DEST_RE);
  return {
    raw: `${code}${num}`,
    airline: AIRLINES[code] ?? code,
    number: num,
    destination: destMatch?.[1],
    departureTime: startDate ? new Date(startDate) : undefined,
  };
}

/** Which day an event is on: today (also events with no start time), tomorrow, or later. */
function whichDay(at: Date | undefined, todayEnd: number, tomorrowEnd: number): 'today' | 'tomorrow' | null {
  if (!at) return 'today';
  const t = at.getTime();
  if (Number.isNaN(t)) return null;
  if (t < todayEnd) return 'today';
  return t < tomorrowEnd ? 'tomorrow' : null;
}

/** Reads today's calendar events and extracts flight/travel context. Returns null on permission denial or unavailability. */
export async function readCalendarContext(): Promise<CalendarContext | null> {
  try {
    // react-native-calendar-events may export via default or as a plain object.

    const mod = require('react-native-calendar-events');
    const RNCalendarEvents = mod.default ?? mod;
    const status: string = await RNCalendarEvents.requestPermissions(true);
    if (status !== 'authorized') return null;

    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2).toISOString();
    const events: Array<{ title?: string; startDate?: string; allDay?: boolean }> =
      await RNCalendarEvents.fetchAllEvents(start, end, []);

    const flights: CalendarFlight[] = [];
    const travelKeywords: string[] = [];
    const eventTitles: string[] = [];
    const seen = new Set<string>();
    const today: NonNullable<CalendarContext['today']> = [];
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
    const tomorrowEnd = todayEnd + 864e5;
    const tomorrow: NonNullable<CalendarContext['tomorrow']> = [];

    for (const e of events) {
      const title = (e.title ?? '').trim();
      if (!title) continue;
      eventTitles.push(title);
      const at = e.startDate ? new Date(e.startDate) : undefined;
      const day = whichDay(at, todayEnd, tomorrowEnd);
      if (day === 'today') today.push({ title, start: at, allDay: e.allDay });
      else if (day === 'tomorrow') tomorrow.push({ title, start: at, allDay: e.allDay });
      const flight = parseFlight(title, e.startDate ?? '');
      if (flight && !seen.has(flight.raw)) { seen.add(flight.raw); flights.push(flight); }
      if (TRAVEL_RE.test(title)) {
        for (const w of title.split(/\s+/)) {
          if (w.length >= 5 && /^[A-Z]/.test(w) && !travelKeywords.includes(w)) travelKeywords.push(w);
        }
      }
    }
    today.sort((a, b) => (a.start?.getTime() ?? 0) - (b.start?.getTime() ?? 0));
    tomorrow.sort((a, b) => (a.start?.getTime() ?? 0) - (b.start?.getTime() ?? 0));
    return { flights, travelKeywords: travelKeywords.slice(0, 5), eventTitles, today, tomorrow };
  } catch {
    return null;
  }
}

/**
 * Fetches live flight status text for a flight number (e.g. "AA2847") using the same
 * readPage web scraper the AI uses. Tries FlightAware first, falls back to a Bing search.
 * No API key required — the same mechanism Google/Bing use to show their flight cards.
 * Returns null if the device is offline or both sources are unreachable.
 */
export async function fetchFlightStatus(flightNumber: string): Promise<string | null> {

  const { readPage } = require('../services/tools/handlers');
  const id = flightNumber.toUpperCase().replace(/\s+/g, '');
  const urls = [
    `https://www.flightaware.com/live/flight/${id}`,
    `https://www.bing.com/search?q=${encodeURIComponent(`${id} flight status`)}`,
  ];
  for (const url of urls) {
    try {
      const text: string = await readPage(url, 1500);
      if (text && text.length > 150) return text.slice(0, 1200);
    } catch { /* try next source */ }
  }
  return null;
}

/** Returns a short sentence describing flight/travel context, or '' if none. */
export function calendarSummary(ctx: CalendarContext): string {
  const parts: string[] = [];
  for (const f of ctx.flights) {
    const time = f.departureTime
      ? ` at ${f.departureTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
      : '';
    const dest = f.destination ? ` to ${f.destination}` : '';
    parts.push(`flight ${f.raw} (${f.airline})${time}${dest}`);
  }
  if (!parts.length && ctx.travelKeywords.length) {
    parts.push(`travel plans involving ${ctx.travelKeywords.slice(0, 3).join(', ')}`);
  }
  return parts.length ? `Today: ${parts.join('; ')}.` : '';
}

/**
 * What is on the calendar today, as sentences to speak ('' when nothing is). Events are named with their start times,
 * up to six, so the briefing always covers the day's plans instead of leaving it to the model to remember.
 */
export function calendarSpoken(ctx: CalendarContext | null | undefined, opts: { birthdays?: boolean; day?: 'today' | 'tomorrow' } = {}): string {
  const day = opts.day ?? 'today';
  const all = (day === 'tomorrow' ? ctx?.tomorrow : ctx?.today) ?? [];
  if (!all.length) return '';
  // Birthdays and anniversaries are said first as themselves; the other events are listed.
  const { said: special, rest } = opts.birthdays === false ? { said: '', rest: all.map((e) => e.title) } : specialDays(all.map((e) => e.title), day === 'tomorrow' ? 'Tomorrow' : 'Today');
  const events = all.filter((e) => rest.includes(e.title));
  if (!events.length) return special;
  const say = (e: NonNullable<CalendarContext['today']>[number]) => (e.start && !e.allDay
    ? `${e.title} at ${e.start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
    : e.title);
  const shown = events.slice(0, 6).map(say);
  const more = events.length > 6 ? `, and ${events.length - 6} more` : '';
  const list = shown.length > 1 ? `${shown.slice(0, -1).join(', ')}, and ${shown[shown.length - 1]}` : shown[0];
  return `${special ? `${special} ` : ''}On your calendar ${day}: ${list}${more}.`;
}
