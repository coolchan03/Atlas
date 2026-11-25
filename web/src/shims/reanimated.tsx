// A small, dependency-free implementation of the react-native-reanimated surface Atlas uses
// (shared values, animated styles, timing/spring/sequence/repeat/delay, interpolate, Animated.View...).
// Reanimated 4's web runtime needs the worklets babel plugin; the app only needs these few primitives,
// so they run on the JS thread with requestAnimationFrame. Layout/entering animations are no-ops.
import * as React from 'react';
import { View, Text, Image, ScrollView, FlatList, Easing as RNEasing, StyleSheet } from 'react-native-web';

type Anim = {
  __anim: true;
  start: (from: number, done: (finished: boolean, value: number) => void, set: (v: number) => void) => () => void;
  /** The same animation aimed at another target (used by withRepeat(..., reverse)). */
  retarget?: (to: number) => Anim;
};
const isAnim = (x: unknown): x is Anim => !!x && typeof x === 'object' && (x as Anim).__anim === true;

let tracker: Set<SharedValue<any>> | null = null;

export class SharedValue<T> {
  private v: T;
  private subs = new Set<() => void>();
  private cancel: (() => void) | null = null;
  constructor(v: T) {
    this.v = v;
  }
  get value(): T {
    tracker?.add(this);
    return this.v;
  }
  set value(next: T | Anim) {
    this.cancel?.();
    this.cancel = null;
    if (isAnim(next)) {
      const from = typeof this.v === 'number' ? (this.v as number) : 0;
      this.cancel = next.start(from, () => (this.cancel = null), (n) => this.set(n as T));
    } else this.set(next as T);
  }
  get(): T {
    return this.v;
  }
  set(next: T) {
    this.v = next;
    this.subs.forEach((f) => f());
  }
  subscribe(f: () => void) {
    this.subs.add(f);
    return () => {
      this.subs.delete(f);
    };
  }
  stop() {
    this.cancel?.();
    this.cancel = null;
  }
}

export function useSharedValue<T>(initial: T): SharedValue<T> {
  const ref = React.useRef<SharedValue<T> | null>(null);
  if (!ref.current) ref.current = new SharedValue(initial);
  return ref.current;
}
export function cancelAnimation(sv: SharedValue<any>) {
  sv.stop();
}

type EasingFn = (t: number) => number;
const defaultEase: EasingFn = (t) => (RNEasing as any).inOut((RNEasing as any).quad)(t);

function timingAnim(to: number, cfg: { duration?: number; easing?: EasingFn } | undefined, cb?: (f: boolean) => void): Anim {
  return {
    __anim: true,
    retarget: (t) => timingAnim(t, cfg),
    start(from, done, set) {
      const dur = cfg?.duration ?? 300;
      const ease = cfg?.easing ?? defaultEase;
      const t0 = performance.now();
      let raf = 0;
      let dead = false;
      const tick = (now: number) => {
        if (dead) return;
        const p = dur <= 0 ? 1 : Math.min(1, (now - t0) / dur);
        set(from + (to - from) * ease(p));
        if (p < 1) raf = requestAnimationFrame(tick);
        else {
          done(true, to);
          cb?.(true);
        }
      };
      raf = requestAnimationFrame(tick);
      return () => {
        dead = true;
        cancelAnimationFrame(raf);
        cb?.(false);
      };
    },
  };
}
export const withTiming = (to: number, cfg?: { duration?: number; easing?: EasingFn }, cb?: (f: boolean) => void) => timingAnim(to, cfg, cb);

function springAnim(to: number, cfg: { damping?: number; stiffness?: number; mass?: number } | undefined, cb?: (f: boolean) => void): Anim {
  return {
    __anim: true,
    retarget: (t) => springAnim(t, cfg),
    start(from, done, set) {
      const k = cfg?.stiffness ?? 100;
      const c = cfg?.damping ?? 10;
      const m = cfg?.mass ?? 1;
      let x = from;
      let v = 0;
      let last = performance.now();
      let raf = 0;
      let dead = false;
      const tick = (now: number) => {
        if (dead) return;
        let dt = Math.min(0.032, (now - last) / 1000);
        last = now;
        for (; dt > 0; dt -= 0.004) {
          const h = Math.min(dt, 0.004);
          v += ((-k * (x - to) - c * v) / m) * h;
          x += v * h;
        }
        if (Math.abs(x - to) < 0.002 && Math.abs(v) < 0.02) {
          set(to);
          done(true, to);
          cb?.(true);
          return;
        }
        set(x);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      return () => {
        dead = true;
        cancelAnimationFrame(raf);
        cb?.(false);
      };
    },
  };
}
export const withSpring = (to: number, cfg?: { damping?: number; stiffness?: number; mass?: number }, cb?: (f: boolean) => void) => springAnim(to, cfg, cb);
export const withDecay = (_cfg?: { velocity?: number }): Anim => ({ __anim: true, start: (_f, done) => (done(true, 0), () => undefined) });

export const withDelay = (ms: number, inner: Anim | number): Anim => ({
  __anim: true,
  retarget: (t) => withDelay(ms, isAnim(inner) && inner.retarget ? inner.retarget(t) : t),
  start(from, done, set) {
    let cancel: (() => void) | null = null;
    const t = setTimeout(() => {
      if (isAnim(inner)) cancel = inner.start(from, done, set);
      else {
        set(inner);
        done(true, inner);
      }
    }, ms);
    return () => {
      clearTimeout(t);
      cancel?.();
    };
  },
});
export const withSequence = (...steps: (Anim | number)[]): Anim => ({
  __anim: true,
  start(from, done, set) {
    let i = 0;
    let cancel: (() => void) | null = null;
    let dead = false;
    let cur = from;
    const next = () => {
      if (dead) return;
      if (i >= steps.length) return void done(true, cur);
      const s = steps[i++];
      if (isAnim(s))
        cancel = s.start(
          cur,
          (_f, val) => {
            cur = val;
            next();
          },
          (n) => {
            cur = n;
            set(n);
          },
        );
      else {
        cur = s;
        set(s);
        next();
      }
    };
    next();
    return () => {
      dead = true;
      cancel?.();
    };
  },
});
/** Repeats `inner`; `count <= 0` repeats forever. With `reverse`, every second run goes back to the start. */
export const withRepeat = (inner: Anim, count = 2, reverse = false, cb?: (f: boolean) => void): Anim => ({
  __anim: true,
  start(from, done, set) {
    let n = 0;
    let cancel: (() => void) | null = null;
    let dead = false;
    let at = from;
    const run = () => {
      if (dead) return;
      if (count > 0 && n >= count) {
        done(true, at);
        cb?.(true);
        return;
      }
      const back = reverse && n % 2 === 1 && inner.retarget;
      const anim = back ? inner.retarget!(from) : inner;
      n++;
      cancel = anim.start(
        reverse ? at : from,
        (_f, val) => {
          at = val;
          run();
        },
        (v) => {
          at = v;
          set(v);
        },
      );
    };
    run();
    return () => {
      dead = true;
      cancel?.();
    };
  },
});

const E: any = RNEasing;
export const Easing = {
  linear: (t: number) => t,
  ease: E.ease,
  quad: E.quad,
  cubic: E.cubic,
  poly: E.poly,
  sin: E.sin,
  circle: E.circle,
  exp: E.exp,
  elastic: E.elastic,
  back: E.back,
  bounce: E.bounce,
  bezier: (a: number, b: number, c: number, d: number) => E.bezier(a, b, c, d),
  in: E.in,
  out: E.out,
  inOut: E.inOut,
};

export function interpolate(
  x: number,
  input: number[],
  output: number[],
  extrapolate: 'clamp' | 'extend' | 'identity' | { extrapolateLeft?: string; extrapolateRight?: string } = 'extend',
): number {
  const n = input.length;
  const left = typeof extrapolate === 'string' ? extrapolate : extrapolate.extrapolateLeft ?? 'extend';
  const right = typeof extrapolate === 'string' ? extrapolate : extrapolate.extrapolateRight ?? 'extend';
  if (x <= input[0]) return left === 'clamp' ? output[0] : left === 'identity' ? x : output[0] + ((x - input[0]) * (output[1] - output[0])) / (input[1] - input[0]);
  if (x >= input[n - 1])
    return right === 'clamp' ? output[n - 1] : right === 'identity' ? x : output[n - 1] + ((x - input[n - 1]) * (output[n - 1] - output[n - 2])) / (input[n - 1] - input[n - 2]);
  let i = 1;
  while (x > input[i]) i++;
  return output[i - 1] + ((x - input[i - 1]) * (output[i] - output[i - 1])) / (input[i] - input[i - 1]);
}
export const Extrapolation = { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' } as const;
export const Extrapolate = Extrapolation;
export const runOnJS = <T extends (...a: any[]) => any>(fn: T) => fn;
export const runOnUI = runOnJS;
export const useReducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
export const useDerivedValue = <T,>(fn: () => T): { value: T } => ({
  get value() {
    return fn();
  },
});
export const useAnimatedProps = (fn: () => object) => ({ __animProps: fn });
export const useAnimatedScrollHandler = () => undefined;
export const useAnimatedRef = () => React.useRef(null);
export const useAnimatedReaction = () => undefined;
export const makeMutable = <T,>(v: T) => new SharedValue(v);

// --- animated styles + components -------------------------------------------------------------
type StyleFn = { __animStyle: () => Record<string, any> };
export const useAnimatedStyle = (fn: () => Record<string, any>, _deps?: unknown[]): StyleFn => {
  const ref = React.useRef<StyleFn>({ __animStyle: fn });
  ref.current.__animStyle = fn; // latest closure under a stable identity
  return ref.current;
};
const isStyleFn = (s: any): s is StyleFn => !!s && typeof s === 'object' && typeof s.__animStyle === 'function';

function resolve(style: any, deps: Set<SharedValue<any>>): any {
  if (Array.isArray(style)) return style.map((s) => resolve(s, deps));
  if (!isStyleFn(style)) return style;
  const prev = tracker;
  tracker = deps;
  try {
    return style.__animStyle();
  } finally {
    tracker = prev;
  }
}

function useResolvedStyle(style: any) {
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  const deps = new Set<SharedValue<any>>();
  const resolved = resolve(style, deps);
  const list = [...deps];
  React.useEffect(() => {
    const offs = list.map((sv) => sv.subscribe(() => force()));
    return () => offs.forEach((o) => o());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, list);
  return resolved;
}

export function createAnimatedComponent<P extends object>(Component: React.ComponentType<P>) {
  const Wrapped = React.forwardRef<any, any>(({ style, entering: _e, exiting: _x, layout: _l, ...rest }, ref) => {
    const resolved = useResolvedStyle(style);
    return <Component ref={ref} {...(rest as P)} style={StyleSheet.flatten(resolved)} />;
  });
  Wrapped.displayName = `Animated(${(Component as any).displayName ?? (Component as any).name ?? 'Component'})`;
  return Wrapped;
}

const Animated = {
  View: createAnimatedComponent(View),
  Text: createAnimatedComponent(Text),
  Image: createAnimatedComponent(Image),
  ScrollView: createAnimatedComponent(ScrollView),
  FlatList: createAnimatedComponent(FlatList as any),
  createAnimatedComponent,
};
export default Animated;
export { Animated };

// Entering / exiting / layout builders: accepted, chainable, ignored (the item simply appears).
const builder: any = new Proxy(function () {}, { get: (_t, k) => (k === 'then' ? undefined : builder), apply: () => builder });
export const FadeIn = builder, FadeOut = builder, FadeInDown = builder, FadeInUp = builder, FadeInLeft = builder, FadeInRight = builder,
  FadeOutDown = builder, FadeOutUp = builder, SlideInDown = builder, SlideInUp = builder, SlideInLeft = builder, SlideInRight = builder,
  SlideOutDown = builder, SlideOutUp = builder, ZoomIn = builder, ZoomOut = builder, Layout = builder, LinearTransition = builder,
  FadingTransition = builder, BounceIn = builder, StretchInX = builder;
export const ReduceMotion = { System: 'system', Always: 'always', Never: 'never' };
