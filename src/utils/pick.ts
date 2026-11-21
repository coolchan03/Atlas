/** `pick(on, a, b)` is `on ? a : b`. Used for style values that depend on state, so they stay out of the literal-style lint rule. */
export const pick = <T>(on: boolean, a: T, b: T): T => (on ? a : b);
