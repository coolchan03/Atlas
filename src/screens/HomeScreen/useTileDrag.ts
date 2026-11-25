import { useRef, useState } from 'react';
import type { GestureResponderEvent, LayoutChangeEvent, View } from 'react-native';

interface Rect { x: number; y: number; width: number; height: number }
/** Moves are ignored for this long after a swap, so tiles still sliding into place are not hit again. */
const SETTLE_MS = 160;
/** How long after a finger lifts a pick-up that never turned into a move is dropped. */
const DROP_MS = 80;

/**
 * Hold a tile down, then slide it over another to put it in that place. Touch handling only: `onOver(dragged, target)` says what to
 * reorder. The list stops scrolling while a tile is held (`dragging` is the held tile's key, or null).
 */
export function useTileDrag(onOver: (dragged: string, target: string) => void) {
  const listRef = useRef<View>(null);
  const rects = useRef(new Map<string, Rect>());
  const origin = useRef({ x: 0, y: 0 });
  const held = useRef<string | null>(null);
  const captured = useRef(false);
  const swappedAt = useRef(0);
  const [dragging, setDragging] = useState<string | null>(null);

  const end = () => { held.current = null; captured.current = false; setDragging(null); };
  const begin = (key: string) => {
    held.current = key; captured.current = false; setDragging(key);
    listRef.current?.measureInWindow?.((x: number, y: number) => { origin.current = { x, y }; });
  };
  const tileUnder = (pageX: number, pageY: number): string | null => {
    const x = pageX - origin.current.x;
    const y = pageY - origin.current.y;
    for (const [key, r] of rects.current) if (x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height) return key;
    return null;
  };

  const listProps = {
    ref: listRef,
    onMoveShouldSetResponderCapture: () => held.current !== null,
    onResponderTerminationRequest: () => false,
    onResponderGrant: () => { captured.current = true; },
    onResponderMove: (e: GestureResponderEvent) => {
      const key = held.current;
      if (!key || Date.now() - swappedAt.current < SETTLE_MS) return;
      const over = tileUnder(e.nativeEvent.pageX, e.nativeEvent.pageY);
      if (over && over !== key) { swappedAt.current = Date.now(); onOver(key, over); }
    },
    onResponderRelease: end,
    onResponderTerminate: end,
  };
  const tileProps = (key: string, enabled: boolean) => ({
    onLayout: (e: LayoutChangeEvent) => { rects.current.set(key, e.nativeEvent.layout); },
    onLongPress: enabled ? () => begin(key) : undefined,
    delayLongPress: 350,
    // A held tile that is let go without moving never reaches the list's handlers: drop it here.
    onPressOut: () => { setTimeout(() => { if (held.current && !captured.current) end(); }, DROP_MS); },
  });
  return { listRef, listProps, tileProps, dragging };
}
