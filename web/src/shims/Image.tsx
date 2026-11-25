// <Image> that understands the app's file:// URIs. Images the app saves (generated pictures, attachments,
// map tiles, book figures) live in the virtual file system, which the browser cannot load directly:
// they are turned into blob: URLs (OPFS) or atlas-file:// URLs (Windows app) on demand.
import * as React from 'react';
import { Image as RNWImage, ImageBackground as RNWImageBackground } from 'react-native-web';
import { blobUrlFor } from '../host/files';
import { norm, fs } from '../host/fs';

const isVirtual = (uri?: string) => !!uri && (uri.startsWith('file://') || (uri.startsWith('/atlas') && !uri.startsWith('//')) || /^\/[A-Za-z]:\//.test(uri));

/** Resolve a (possibly virtual) URI to something the browser can load. */
export async function resolveUri(uri: string): Promise<string> {
  if (!isVirtual(uri)) return uri;
  const p = norm(uri);
  // The version in the key makes an image that was overwritten in place load again.
  let v = '';
  try { const s = await fs().stat(p); v = `${s.mtime}-${s.size}`; } catch { /* missing: blobUrlFor reports it */ }
  const url = await blobUrlFor(p, v);
  return url;
}

function useResolved(source: any): any {
  const uri: string | undefined = source && typeof source === 'object' && !Array.isArray(source) ? source.uri : undefined;
  const [state, setState] = React.useState<{ from?: string; to?: string }>({});
  React.useEffect(() => {
    if (!uri || !isVirtual(uri)) return;
    let alive = true;
    resolveUri(uri).then((to) => alive && setState({ from: uri, to })).catch(() => alive && setState({ from: uri, to: undefined }));
    return () => { alive = false; };
  }, [uri]);
  if (!uri || !isVirtual(uri)) return source;
  return state.from === uri && state.to ? { ...source, uri: state.to } : { ...source, uri: 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==' };
}

export const Image: any = React.forwardRef<any, any>((props, ref) => <RNWImage ref={ref} {...props} source={useResolved(props.source)} />);
Image.displayName = 'Image';
Image.getSize = (uri: string, ok: (w: number, h: number) => void, fail?: (e: unknown) => void) => {
  resolveUri(uri).then((u) => (RNWImage as any).getSize(u, ok, fail)).catch((e) => fail?.(e));
};
Image.getSizeWithHeaders = (uri: string, _h: unknown, ok: (w: number, h: number) => void, fail?: (e: unknown) => void) => Image.getSize(uri, ok, fail);
Image.prefetch = (uri: string) => resolveUri(uri).then((u) => (RNWImage as any).prefetch(u));
Image.resolveAssetSource = (RNWImage as any).resolveAssetSource;
Image.queryCache = async () => ({});

export const ImageBackground: any = React.forwardRef<any, any>((props, ref) => <RNWImageBackground ref={ref} {...props} source={useResolved(props.source)} />);
