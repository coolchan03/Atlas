// The app's own modules, loaded lazily by the web layer. Kept as plain JavaScript so the web project's type check
// does not pull the whole app into its program (the app is type-checked by the root project).
export const loadServices = () => import('../../../src/services');
export const loadStores = () => import('../../../src/stores');
