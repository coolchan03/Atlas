let sequence = 0;

/**
 * Collision-resistant enough for local in-memory/persisted UI records without using
 * a pseudorandom generator. These IDs are not security tokens.
 */
export function localUniqueId(prefix = 'id'): string {
  sequence = (sequence + 1) % Number.MAX_SAFE_INTEGER;
  return `${prefix}-${Date.now().toString(36)}-${sequence.toString(36)}`;
}
