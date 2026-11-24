import { fetchWithTimeout } from '../services/httpClient';
import { useCurrency } from './store';

/** The European Central Bank's daily rates, free and without a key (frankfurter.dev). */
const RATES_URL = 'https://api.frankfurter.dev/v1/latest?base=USD';

interface RatesReply { date?: unknown; rates?: unknown }

/** Fetches today's rates and keeps them. Throws a plain sentence when the phone is offline or the answer is not rates. */
export async function updateRates(): Promise<string> {
  let reply: RatesReply;
  try { reply = await fetchWithTimeout<RatesReply>(RATES_URL, { timeout: 15000 }); }
  catch { throw new Error('Could not reach the rates server. Check the connection, or type your own rate.'); }
  const raw = reply?.rates;
  const date = typeof reply?.date === 'string' ? reply.date : null;
  if (!raw || typeof raw !== 'object' || !date) throw new Error('The rates server sent something unexpected. Try again later, or type your own rate.');
  const rates: Record<string, number> = {};
  for (const [code, value] of Object.entries(raw as Record<string, unknown>)) if (/^[A-Z]{3}$/.test(code) && typeof value === 'number' && value > 0 && Number.isFinite(value)) rates[code] = value;
  if (Object.keys(rates).length < 5) throw new Error('The rates server sent too few rates. Try again later, or type your own rate.');
  useCurrency.getState().setRates(rates, date);
  return date;
}
