export const runOnJS = <T extends (...a: any[]) => any>(fn: T) => fn;
export const runOnUI = <T extends (...a: any[]) => any>(fn: T) => fn;
export const scheduleOnRN = (fn: (...a: any[]) => any, ...args: any[]) => fn(...args);
export const scheduleOnUI = scheduleOnRN;
export const createWorkletRuntime = () => ({});
export const isWorkletFunction = () => false;
export default { runOnJS, runOnUI };
