// Windows: "Open with Atlas" on a .gguf (or a double click) hands the path to the app, which imports the model.
import { Alert } from '../shims/react-native';
import { bus } from '../native/registry';

export function listenForOpenedFiles() {
  const host = (globalThis as any).atlasHost;
  host?.onOpenUrl?.((url: string) => bus.emit('AtlasOpenUrl', { url }));
  if (!host?.onOpenFile) return;
  host.onOpenFile(async (virtualPath: string) => {
    const name = virtualPath.split('/').pop() ?? 'file';
    if (!/\.gguf$/i.test(name)) return; // documents are opened from inside the app
    try {
      // @ts-ignore (plain JS on purpose, see appModules.js)
      const { loadServices, loadStores } = await import('./appModules.js');
      const { modelManager }: any = await loadServices();
      const { useAppStore }: any = await loadStores();
      const { fs } = await import('./fs');
      const size = (await fs().stat(virtualPath)).size;
      const model = await modelManager.importLocalModel({ sourceUri: `file://${virtualPath}`, fileName: name, sourceSize: size });
      useAppStore.getState().addDownloadedModel(model);
      Alert.alert('Model added', `${model.name} was added to your models. Open Models to load it.`);
    } catch (e: any) {
      Alert.alert('Could not add the model', String(e?.message ?? e));
    }
  });
}
