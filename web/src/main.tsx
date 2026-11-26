import { AppRegistry } from 'react-native-web';
import './native';
import { boot } from './boot';
import { registerServiceWorker } from './pwa/register';
import { startBanner } from './pwa/banner';
import { listenForOpenedFiles } from './host/openFile';
import { installUpdater } from './updater';
import { showFatal, watchStartup } from './fatal';

async function start() {
  installUpdater();
  await boot();
  // WebGPU models join the Models list (see engines/llm/webgpuCatalog.ts); must be set before the app's modules load.
  // Optional: a device whose GPU reports odd things must still open the app, just without the extra models.
  if ((navigator as any).gpu) {
    try {
      const cat = await import('./engines/llm/webgpuCatalog');
      await cat.adaptToAdapter().catch(() => undefined);
      (globalThis as any).__ATLAS_EXTRA_MODELS__ = cat.recommendedEntries();
      cat.installHfInterceptor();
    } catch (e) { console.warn('[start] WebGPU model list skipped', e); }
  }
  // The Windows app with its image engine: the Models > Image list offers stable-diffusion.cpp checkpoints (see native/imageCatalog.ts).
  if ((globalThis as any).atlasHost?.image?.available) {
    try {
      const cat = await import('./native/imageCatalog');
      (globalThis as any).__ATLAS_IMAGE_CATALOG__ = cat.imageCatalog;
      (globalThis as any).__ATLAS_IMAGE_RECOMMENDATION__ = cat.imageRecommendation;
      (globalThis as any).__ATLAS_IMAGE_CPU_FALLBACK__ = true; // see appStore.ts: a PC with no usable GPU still makes pictures, on the CPU
    } catch (e) { console.warn('[start] image model list skipped', e); }
  }
  const { default: App } = await import('../../App');
  AppRegistry.registerComponent('Atlas', () => App);
  AppRegistry.runApplication('Atlas', { rootTag: document.getElementById('root')! });
  document.getElementById('boot')?.remove();
  void registerServiceWorker();
  startBanner();
  listenForOpenedFiles();
}
watchStartup();
start().catch(showFatal);
