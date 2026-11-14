/**
 * A seeded "press everything" explorer for screens. Given a rendered tree it repeatedly presses buttons, types into inputs, flips
 * switches and moves sliders in a repeatable order, preferring controls it has not touched yet, so the screen's many state-dependent
 * branches (menus, tabs, empty and error states) all run. It asserts only what a screen must always do: not crash. Specific
 * behaviour belongs in specific tests.
 */
import { act } from '@testing-library/react-native';
import { Alert } from 'react-native';

export interface MonkeyOptions { presses?: number; seed?: number; skip?: RegExp; text?: string[] }

const rng = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const nodes = (root: any, test: (n: any) => boolean): any[] => { try { return root.findAll(test); } catch { return []; } };
const label = (n: any): string => String(n.props.testID ?? n.props.accessibilityLabel ?? n.props.placeholder ?? n.props.title ?? '');
const identity = (n: any): string => `${n.type?.displayName ?? n.type?.name ?? n.type}:${label(n)}:${String(n.props.children?.length ?? '')}`;

type Kind = 'press' | 'longPress' | 'text' | 'switch' | 'slider' | 'submit' | 'close';
const KINDS: Array<[Kind, (n: any) => boolean]> = [
  ['press', (n) => typeof n.props?.onPress === 'function' && n.props.disabled !== true],
  ['longPress', (n) => typeof n.props?.onLongPress === 'function' && n.props.disabled !== true],
  ['text', (n) => typeof n.props?.onChangeText === 'function' && n.props.editable !== false],
  ['switch', (n) => typeof n.props?.onValueChange === 'function' && typeof n.props.minimumValue !== 'number' && n.props.disabled !== true],
  ['slider', (n) => typeof n.props?.onValueChange === 'function' && typeof n.props.minimumValue === 'number'],
  ['submit', (n) => typeof n.props?.onSubmitEditing === 'function'],
  ['close', (n) => typeof n.props?.onRequestClose === 'function' && n.props.visible !== false],
];

export async function explore(view: { UNSAFE_root: any }, options: MonkeyOptions = {}): Promise<{ pressed: number; errors: string[] }> {
  const { presses = 60, seed = 1, skip, text = ['hello', '42', 'Lease notes', '', 'a much longer line of text with several words in it to test wrapping', '-3.5'] } = options;
  const next = rng(seed);
  const errors: string[] = [];
  const touched = new Map<string, number>();
  let pressed = 0;
  // Dialogs answer themselves: a random action button (never Cancel) is pressed, so the work behind every confirmation also runs.
  // Pressing everything starts network calls (add-on downloads, searches). On a real network they finish after the test is over and their
  // dialogs then hit a torn-down environment, so the explorer is offline: they fail at once, while the test can still see them.
  const realFetch = (global as { fetch?: unknown }).fetch;
  const offline = !(realFetch && (realFetch as { _isMockFunction?: boolean })._isMockFunction);
  if (offline) (global as { fetch?: unknown }).fetch = jest.fn(async () => { throw new Error('No network in tests'); });
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(((_t: string, _m?: string, buttons?: Array<{ text?: string; style?: string; onPress?: (v?: string) => void }>) => {
    const actions = (buttons ?? []).filter((b) => b.style !== 'cancel');
    const pick = actions[Math.floor(next() * actions.length)];
    try { const r: unknown = pick?.onPress?.('hello'); if (r && typeof (r as Promise<unknown>).catch === 'function') (r as Promise<unknown>).catch(() => undefined); } catch (e) { errors.push(`alert: ${String((e as Error)?.message ?? e).slice(0, 100)}`); }
  }) as never);
  for (let i = 0; i < presses; i++) {
    const pool: Array<{ kind: Kind; node: any; id: string }> = [];
    for (const [kind, test] of KINDS) for (const node of nodes(view.UNSAFE_root, (n) => test(n) && !(skip && skip.test(label(n))))) pool.push({ kind, node, id: `${kind}|${identity(node)}` });
    if (!pool.length) break;
    // Controls not yet used are three times as likely to be picked, so one pass reaches most of the screen before repeating.
    const weighted = pool.flatMap((p) => Array(touched.has(p.id) ? 1 : 3).fill(p));
    const target = weighted[Math.floor(next() * weighted.length)];
    touched.set(target.id, (touched.get(target.id) ?? 0) + 1);
    const p = target.node.props;
    try {
      await act(async () => {
        switch (target.kind) {
          case 'text': p.onChangeText(text[Math.floor(next() * text.length)]); break;
          case 'switch': p.onValueChange(next() > 0.5); break;
          case 'slider': { const lo = Number(p.minimumValue); const hi = Number(p.maximumValue ?? lo + 1); p.onValueChange(lo + next() * (hi - lo)); p.onSlidingComplete?.(lo + next() * (hi - lo)); break; }
          case 'submit': p.onSubmitEditing({ nativeEvent: { text: 'hello' } }); break;
          case 'close': p.onRequestClose(); break;
          case 'longPress': p.onLongPress({ nativeEvent: {} }); break;
          default: p.onPress({ nativeEvent: {}, stopPropagation() { /* none */ }, preventDefault() { /* none */ } });
        }
        await Promise.resolve();
      });
      pressed++;
    } catch (e) { errors.push(`${label(target.node)}: ${String((e as Error)?.message ?? e).slice(0, 120)}`); }
  }
  await act(async () => { for (let i = 0; i < 4; i++) await new Promise((resolve) => setImmediate(resolve)); }); // let failed calls finish while the test is alive
  alertSpy.mockRestore();
  if (offline) (global as { fetch?: unknown }).fetch = realFetch;
  return { pressed, errors };
}
