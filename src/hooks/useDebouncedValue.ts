import { useEffect, useState } from 'react';

/** A value that follows another only after it has stayed the same for `ms`, so work done on it (a search over every chat) runs once per pause in typing, not once per key. */
export function useDebouncedValue<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}
