import { useCallback, useRef } from 'react';

/** Counts quick taps in a row: after `count` taps, each within `windowMs` of the one before, `onOpen` runs and the count starts again. Pure of any screen. */
export function createSecretTaps(rule: { count: number; windowMs: number }, onOpen: () => void, now: () => number = Date.now) {
  const { count, windowMs } = rule;
  let taps = 0;
  let last = 0;
  return () => {
    const t = now();
    taps = t - last > windowMs ? 1 : taps + 1;
    last = t;
    if (taps >= count) { taps = 0; onOpen(); }
  };
}

export function useSecretTaps(count: number, onOpen: () => void, windowMs = 1500): () => void {
  const open = useRef(onOpen);
  open.current = onOpen;
  const tap = useRef(createSecretTaps({ count, windowMs }, () => open.current()));
  return useCallback(() => tap.current(), []);
}
