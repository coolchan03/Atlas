// What `require('x')` returned under Metro: the module's exports, and for a module with a default
// export only (a CommonJS-style module) the default itself. For an ES namespace that has both named
// exports and `default`, callers wrote `require('x').name` or `require('x').default`, so the
// namespace is returned unchanged and both keep working.
export function requireInterop<T>(ns: T): T {
  return ns;
}
