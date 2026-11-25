const PATTERNS: Record<string, number | number[]> = {
  selection: 8, impactLight: 10, impactMedium: 20, impactHeavy: 35, rigid: 25, soft: 12,
  notificationSuccess: [15, 40, 15], notificationWarning: [30, 50, 30], notificationError: [40, 60, 40, 60, 40],
  clockTick: 6, contextClick: 14, keyboardPress: 6, keyboardRelease: 4, keyboardTap: 6, longPress: 30,
  textHandleMove: 5, virtualKey: 8, virtualKeyRelease: 4, effectClick: 10, effectDoubleClick: [10, 30, 10], effectHeavyClick: 35, effectTick: 6,
};
const trigger = (type: string = 'selection') => {
  try {
    navigator.vibrate?.(PATTERNS[type] ?? 10);
  } catch {
    /* unsupported (desktop, iOS Safari) */
  }
};
export default { trigger };
export const HapticFeedbackTypes = new Proxy({}, { get: (_t, k) => String(k) });
export { trigger };
