/**
 * A seeded "press everything" explorer for screens. It renders nothing itself: given a rendered tree it repeatedly presses buttons,
 * types into inputs and flips switches in a repeatable order, so the screen's many state-dependent branches (menus, tabs, empty and
 * error states) all run. It asserts only what a screen must always do: not crash. Specific behaviour belongs in specific tests.
 */
import { act } from '@testing-library/react-native';

export interface MonkeyOptions { presses?: number; seed?: number; skip?: RegExp; text?: string[] }

const rng = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };

const nodes = (root: any, test: (n: any) => boolean): any[] => { try { return root.findAll(test); } catch { return []; } };
const label = (n: any): string => String(n.props.testID ?? n.props.accessibilityLabel ?? '');

export async function explore(view: { UNSAFE_root: any }, options: MonkeyOptions = {}): Promise<{ pressed: number; errors: string[] }> {
  const { presses = 60, seed = 1, skip, text = ['hello', '42', 'Lease notes', ''] } = options;
  const next = rng(seed);
  const errors: string[] = [];
  let pressed = 0;
  for (let i = 0; i < presses; i++) {
    const pressables = nodes(view.UNSAFE_root, (n) => typeof n.props?.onPress === 'function' && n.props.disabled !== true && !(skip && skip.test(label(n))));
    const inputs = nodes(view.UNSAFE_root, (n) => typeof n.props?.onChangeText === 'function' && n.props.editable !== false);
    const switches = nodes(view.UNSAFE_root, (n) => typeof n.props?.onValueChange === 'function' && n.props.disabled !== true);
    const pool = [...pressables, ...pressables, ...inputs, ...switches];
    if (!pool.length) break;
    const target = pool[Math.floor(next() * pool.length)];
    try {
      await act(async () => {
        if (typeof target.props.onChangeText === 'function') target.props.onChangeText(text[Math.floor(next() * text.length)]);
        else if (typeof target.props.onValueChange === 'function') target.props.onValueChange(next() > 0.5);
        else target.props.onPress({ nativeEvent: {}, stopPropagation() {}, preventDefault() {} });
        await Promise.resolve();
      });
      pressed++;
    } catch (e) { errors.push(`${label(target)}: ${String((e as Error)?.message ?? e).slice(0, 120)}`); }
  }
  return { pressed, errors };
}
