// A small DOM dialog used for Alert.alert / ActionSheet / toasts. Plain DOM on purpose: it must work
// before React mounts and from non-React code (services call Alert.alert).
const FONT = "Menlo, Consolas, 'Courier New', monospace";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, css: string, text?: string) {
  const e = document.createElement(tag);
  e.style.cssText = css;
  if (text !== undefined) e.textContent = text;
  return e;
}

export interface DialogButton {
  text?: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: (value?: string) => void;
}
export interface DialogOptions {
  cancelable?: boolean;
  onDismiss?: () => void;
  input?: { defaultValue?: string; secure?: boolean; placeholder?: string };
}

export function showDialog(title: string, message: string | undefined, buttons: DialogButton[], opts: DialogOptions = {}) {
  if (typeof document === 'undefined') return;
  const overlay = el(
    'div',
    `position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.66);display:flex;align-items:center;justify-content:center;padding:16px;font-family:${FONT};`,
  );
  overlay.setAttribute('role', 'alertdialog');
  overlay.setAttribute('aria-modal', 'true');
  const box = el(
    'div',
    'background:#141414;color:#EDEDED;border:1px solid #2c2c2c;border-radius:8px;max-width:420px;width:100%;max-height:80vh;overflow:auto;padding:16px;box-sizing:border-box;',
  );
  if (title) box.appendChild(el('div', 'font-size:15px;margin-bottom:8px;', title));
  if (message) box.appendChild(el('div', 'font-size:13px;color:#b4b4b4;white-space:pre-wrap;line-height:1.45;margin-bottom:14px;', message));
  let input: HTMLInputElement | null = null;
  if (opts.input) {
    input = document.createElement('input');
    input.type = opts.input.secure ? 'password' : 'text';
    input.value = opts.input.defaultValue ?? '';
    input.placeholder = opts.input.placeholder ?? '';
    input.style.cssText = `width:100%;box-sizing:border-box;margin-bottom:12px;padding:8px;background:#0A0A0A;color:#EDEDED;border:1px solid #333;border-radius:6px;font:13px ${FONT};`;
    box.appendChild(input);
    setTimeout(() => input?.focus(), 30);
  }
  const row = el('div', 'display:flex;flex-direction:column;gap:6px;');
  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey, true);
  };
  const list = buttons.length ? buttons : [{ text: 'OK' }];
  const cancelBtn = list.find((b) => b.style === 'cancel');
  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape' && opts.cancelable !== false) {
      close();
      (cancelBtn?.onPress ?? opts.onDismiss)?.();
    }
  };
  document.addEventListener('keydown', onKey, true);
  list.forEach((b, i) => {
    const color = b.style === 'destructive' ? '#ff6b6b' : b.style === 'cancel' ? '#9a9a9a' : '#34d399';
    const btn = el(
      'button',
      `font:13px ${FONT};padding:10px 12px;border-radius:6px;border:1px solid #2c2c2c;background:#0A0A0A;color:${color};cursor:pointer;text-align:center;`,
      b.text ?? 'OK',
    );
    btn.onclick = () => {
      close();
      b.onPress?.(input?.value);
    };
    row.appendChild(btn);
    if (i === 0 && !opts.input) setTimeout(() => btn.focus(), 30);
  });
  box.appendChild(row);
  overlay.appendChild(box);
  overlay.addEventListener('click', (ev) => {
    if (ev.target === overlay && opts.cancelable) {
      close();
      opts.onDismiss?.();
    }
  });
  document.body.appendChild(overlay);
}

export function showToast(message: string, ms = 2600) {
  if (typeof document === 'undefined') return;
  const t = el(
    'div',
    `position:fixed;left:50%;bottom:48px;transform:translateX(-50%);z-index:2147483001;background:#EDEDED;color:#0A0A0A;padding:9px 14px;border-radius:6px;font:13px ${FONT};max-width:86vw;box-shadow:0 4px 20px rgba(0,0,0,.4);`,
    message,
  );
  t.setAttribute('role', 'status');
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}
