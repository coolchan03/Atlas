/**
 * Reads the phone's native calendar to surface flight numbers and travel context
 * in the daily briefing. Uses react-native-calendar-events (already installed).
 * Silently returns null if permission is denied or the module is unavailable.
 */

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
}

const TRAVEL_RE = /\b(hotel|flight|fly|depart|arrival|check[\s-]?in|conference|trip|travel|airport|train|cruise)\b/i;
const FLIGHT_RE = /\b([A-Z]{2})\s*(\d{1,4})\b/g;
const DEST_RE = /\bto\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i;

function parseFlight(title: string, startDate: string): CalendarFlight | null {
  FLIGHT_RE.lastIndex = 0;
  const m = FLIGHT_RE.exec(title);
  if (!m) return null;
  const [, code, num] = m;
  if (!(code in AIRLINES) && !/^[A-Z]{2}$/.test(code)) return null;
  const destMatch = title.match(DEST_RE);
  return {
    raw: `${code}${num}`,
    airline: AIRLINES[code] ?? code,
    number: num,
    destination: destMatch?.[1],
    departureTime: startDate ? new Date(startDate) : undefined,
  };
}

/** Reads today's calendar events and extracts flight/travel context. Returns null on permission denial or unavailability. */
export async function readCalendarContext(): Promise<CalendarContext | null> {
  try {
    // react-native-calendar-events may export via default or as a plain object.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-calendar-events');
    const RNCalendarEvents = mod.default ?? mod;
    const status: string = await RNCalendarEvents.requestPermissions(true);
    if (status !== 'authorized') return null;

    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2).toISOString();
    const events: Array<{ title?: string; startDate?: string }> =
      await RNCalendarEvents.fetchAllEvents(start, end, []);

    const flights: CalendarFlight[] = [];
    const travelKeywords: string[] = [];
    const eventTitles: string[] = [];
    const seen = new Set<string>();

    for (const e of events) {
      const title = (e.title ?? '').trim();
      if (!title) continue;
      eventTitles.push(title);
      const flight = parseFlight(title, e.startDate ?? '');
      if (flight && !seen.has(flight.raw)) { seen.add(flight.raw); flights.push(flight); }
      if (TRAVEL_RE.test(title)) {
        for (const w of title.split(/\s+/)) {
          if (w.length >= 5 && /^[A-Z]/.test(w) && !travelKeywords.includes(w)) travelKeywords.push(w);
        }
      }
    }
    return { flights, travelKeywords: travelKeywords.slice(0, 5), eventTitles };
  } catch {
    return null;
  }
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
