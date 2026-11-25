/// <reference types="vite/client" />
declare module 'react-native-web' {
  export * from 'react-native';
}
declare module '*.wasm?url' {
  const url: string;
  export default url;
}
declare module '*.ttf?url' {
  const url: string;
  export default url;
}
declare module '*.json' {
  const value: any;
  export default value;
}
// WebLLM's own type declarations switch off the DOM library for the whole program; it is used through `any`.
declare module '@mlc-ai/web-llm' {
  export const CreateMLCEngine: (id: string, cfg?: any, chat?: any) => Promise<any>;
  export const prebuiltAppConfig: any;
}
declare module 'pdfjs-dist/build/pdf.worker.min.mjs?url' {
  const url: string;
  export default url;
}
declare module 'pdfjs-dist/build/pdf.mjs' {
  const m: any;
  export = m;
}
declare module 'xz-decompress' {
  export class XzReadableStream extends ReadableStream<Uint8Array> { constructor(src: ReadableStream<Uint8Array>); }
}
