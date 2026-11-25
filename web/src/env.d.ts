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
