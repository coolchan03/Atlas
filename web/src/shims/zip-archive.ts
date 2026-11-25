// react-native-zip-archive over fflate, reading and writing the virtual file system.
import { zipSync, unzipSync, strToU8 } from 'fflate';
import { fs, norm, dirName } from '../host/fs';

async function collect(dir: string, base: string, out: Record<string, Uint8Array>) {
  for (const e of await fs().readdir(dir)) {
    if (e.isDirectory) await collect(e.path, `${base}${e.name}/`, out);
    else out[`${base}${e.name}`] = await fs().readFile(e.path);
  }
}
export async function zip(source: string | string[], target: string) {
  const out: Record<string, Uint8Array> = {};
  for (const s of Array.isArray(source) ? source : [source]) {
    const st = await fs().stat(s);
    if (st.isDirectory) await collect(norm(s), '', out);
    else out[st.name] = await fs().readFile(s);
  }
  await fs().mkdir(dirName(target));
  await fs().writeFile(target, zipSync(out, { level: 6 }));
  return norm(target);
}
export const zipFiles = zip;
export async function unzip(source: string, target: string, _charset?: string) {
  // fflate unzips in memory; large model archives are streamed by the app's own zipDirectory reader.
  const files = unzipSync(await fs().readFile(source));
  await fs().mkdir(target);
  for (const [name, data] of Object.entries(files)) {
    if (name.endsWith('/')) {
      await fs().mkdir(`${norm(target)}/${name}`);
      continue;
    }
    const dest = `${norm(target)}/${name}`;
    await fs().mkdir(dirName(dest));
    await fs().writeFile(dest, data);
  }
  return norm(target);
}
export const unzipAssets = async () => { throw new Error('unzipAssets is not available on the web'); };
export const isPasswordProtected = async () => false;
export const subscribe = () => ({ remove: () => undefined });
void strToU8;
