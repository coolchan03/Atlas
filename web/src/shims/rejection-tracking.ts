// promise/setimmediate/rejection-tracking: the browser already reports unhandled rejections.
export function enable(opts?: { allRejections?: boolean; onUnhandled?: (id: number, error: unknown) => void }) {
  let n = 0;
  window.addEventListener('unhandledrejection', (e) => opts?.onUnhandled?.(n++, e.reason));
}
export function disable() {}
