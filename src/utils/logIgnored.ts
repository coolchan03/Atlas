import logger from './logger';

/**
 * For a step that must not stop what is around it, but whose failure still has to leave a trace: `.catch(logIgnored('clearing the cache'))`.
 * A bare `.catch(() => {})` hides the failure from the debug log, so a later "why did this stop working" has nothing to read. Use it where a
 * failure changes what the person sees or what is kept; plain cleanup of a temporary file does not need it.
 */
export const logIgnored = (what: string) => (error: unknown): void => {
  logger.warn(`[IGNORED] ${what} failed and was skipped:`, error instanceof Error ? error.message : String(error));
};
