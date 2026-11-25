import { pickFiles } from '../host/files';
import { fs } from '../host/fs';

export interface Asset { uri?: string; fileName?: string; type?: string; fileSize?: number; width?: number; height?: number; base64?: string; duration?: number }
export interface ImagePickerResponse { didCancel?: boolean; errorCode?: string; errorMessage?: string; assets?: Asset[] }
interface Opts { mediaType?: 'photo' | 'video' | 'mixed'; quality?: number; maxWidth?: number; maxHeight?: number; selectionLimit?: number; includeBase64?: boolean; cameraType?: 'back' | 'front' }

async function dims(url: string): Promise<{ width: number; height: number }> {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => res({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => res({ width: 0, height: 0 });
    img.src = url;
  });
}

async function run(opts: Opts, capture?: 'environment' | 'user'): Promise<ImagePickerResponse> {
  try {
    const accept = opts.mediaType === 'video' ? ['video/*'] : opts.mediaType === 'mixed' ? ['image/*', 'video/*'] : ['image/*'];
    const picked = await pickFiles({ accept, multiple: (opts.selectionLimit ?? 1) !== 1, capture });
    const assets: Asset[] = [];
    for (const p of picked) {
      const file = await fs().getFile(p.path);
      const url = URL.createObjectURL(file);
      const d = p.type?.startsWith('image/') ? await dims(url) : { width: 0, height: 0 };
      URL.revokeObjectURL(url);
      let base64: string | undefined;
      if (opts.includeBase64) base64 = btoa(String.fromCharCode(...new Uint8Array(await file.arrayBuffer())));
      assets.push({ uri: p.uri, fileName: p.name, type: p.type ?? undefined, fileSize: p.size, ...d, base64 });
    }
    return { assets };
  } catch (e: any) {
    if (e?.code === 'OPERATION_CANCELED') return { didCancel: true };
    return { errorCode: 'others', errorMessage: String(e?.message ?? e) };
  }
}
export const launchImageLibrary = (opts: Opts = {}) => run(opts);
export const launchCamera = (opts: Opts = {}) => run(opts, opts.cameraType === 'front' ? 'user' : 'environment');
