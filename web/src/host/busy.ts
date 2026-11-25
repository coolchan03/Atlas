// Tells the Windows app when work is in flight, so closing the window hides Atlas to the tray instead of stopping a download,
// and shows download progress on the taskbar button. In a browser this does nothing (the tab keeps its own lifetime).
const sources = new Map<string, boolean>();
let lastBusy = false;

const host = () => (globalThis as any).atlasHost as { setBusy?: (b: boolean) => Promise<void>; setProgress?: (f: number) => Promise<void> } | undefined;

export function setBusy(source: string, on: boolean) {
  if (on) sources.set(source, true); else sources.delete(source);
  const any = sources.size > 0;
  if (any !== lastBusy) {
    lastBusy = any;
    void host()?.setBusy?.(any);
    if (!any) void host()?.setProgress?.(-1);
  }
}

/** 0..1 for the taskbar button; null clears it. */
export function setTaskbarProgress(fraction: number | null) {
  void host()?.setProgress?.(fraction == null ? -1 : Math.max(0, Math.min(1, fraction)));
}
