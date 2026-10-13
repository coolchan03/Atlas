import * as Keychain from 'react-native-keychain';

/**
 * Wrong-PIN throttling that survives an app restart. Kept in the Keychain (not
 * AsyncStorage) so clearing app storage or killing the app does not reset it.
 * After 5 wrong PINs the wait starts at 30 s and doubles each time, up to 1 hour.
 */
const SERVICE = 'ai.offgridmobile.pin-throttle';
const FREE_ATTEMPTS = 5;
const BASE_WAIT_MS = 30_000;
const MAX_WAIT_MS = 60 * 60_000;

export interface ThrottleState { failures: number; lockedUntil: number }
const EMPTY: ThrottleState = { failures: 0, lockedUntil: 0 };

const cache = new Map<string, ThrottleState>();

async function read(scope: string): Promise<ThrottleState> {
  const hit = cache.get(scope);
  if (hit) return hit;
  try {
    const found = await Keychain.getGenericPassword({ service: `${SERVICE}.${scope}` });
    if (found) {
      const parsed = JSON.parse(found.password);
      const state = {
        failures: Number(parsed.failures) || 0,
        lockedUntil: Number(parsed.lockedUntil) || 0,
      };
      cache.set(scope, state);
      return state;
    }
  } catch { /* unreadable: start clean */ }
  return EMPTY;
}

async function write(scope: string, state: ThrottleState): Promise<void> {
  cache.set(scope, state);
  try {
    await Keychain.setGenericPassword('throttle', JSON.stringify(state), {
      service: `${SERVICE}.${scope}`,
      accessible: Keychain.ACCESSIBLE?.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  } catch { /* the in-memory copy still throttles this session */ }
}

/** Milliseconds left before another try is allowed (0 = allowed now). */
export async function pinWaitRemaining(scope: string, now = Date.now()): Promise<number> {
  const state = await read(scope);
  return Math.max(0, state.lockedUntil - now);
}

/** Wait after the given number of failures (0 while still within the free attempts). */
export function waitForFailures(failures: number): number {
  if (failures < FREE_ATTEMPTS) return 0;
  const step = failures - FREE_ATTEMPTS;
  return Math.min(MAX_WAIT_MS, BASE_WAIT_MS * 2 ** step);
}

export async function recordPinFailure(scope: string, now = Date.now()): Promise<number> {
  const state = await read(scope);
  const failures = state.failures + 1;
  const wait = waitForFailures(failures);
  await write(scope, { failures, lockedUntil: wait ? now + wait : 0 });
  return wait;
}

export async function recordPinSuccess(scope: string): Promise<void> {
  const state = await read(scope);
  if (state.failures || state.lockedUntil) await write(scope, EMPTY);
}

export function formatWait(ms: number): string {
  const s = Math.ceil(ms / 1000);
  return s >= 60 ? `${Math.ceil(s / 60)} min` : `${s} s`;
}

/** Test hook. */
export function resetPinThrottleCache(): void { cache.clear(); }
