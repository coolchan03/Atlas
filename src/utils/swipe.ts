/** A swipe is mostly sideways and long enough that it was meant: a short or mostly vertical drag (scrolling) is not one. */
const SWIPE_MIN = 64;
export function swipeDirection(dx: number, dy: number): 'left' | 'right' | null {
  if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) < Math.abs(dy) * 2) return null;
  return dx < 0 ? 'left' : 'right';
}

/** Touch handlers that call `onSwipe` for a sideways swipe. Touches are only watched, so scrolling and taps underneath are not affected. */
export function swipeHandlers(onSwipe: (way: 'left' | 'right') => void) {
  let from: { x: number; y: number } | null = null;
  return {
    onTouchStart: (e: any) => { from = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY }; },
    onTouchEnd: (e: any) => {
      const start = from; from = null;
      if (!start) return;
      const way = swipeDirection(e.nativeEvent.pageX - start.x, e.nativeEvent.pageY - start.y);
      if (way) onSwipe(way);
    },
  };
}
