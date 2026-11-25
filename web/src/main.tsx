import { AppRegistry } from 'react-native-web';
import './native';
import { boot } from './boot';
import { registerServiceWorker } from './pwa/register';
import { startBanner } from './pwa/banner';

async function start() {
  await boot();
  // WebGPU models join the Models list (see engines/llm/webgpuCatalog.ts); must be set before the app's modules load.
  if ((navigator as any).gpu) {
    const cat = await import('./engines/llm/webgpuCatalog');
    (globalThis as any).__ATLAS_EXTRA_MODELS__ = cat.recommendedEntries();
    cat.installHfInterceptor();
  }
  const { default: App } = await import('../../App');
  AppRegistry.registerComponent('Atlas', () => App);
  AppRegistry.runApplication('Atlas', { rootTag: document.getElementById('root')! });
  document.getElementById('boot')?.remove();
  void registerServiceWorker();
  startBanner();
}
void start();
