import { AppRegistry } from 'react-native-web';
import './native';
import { boot } from './boot';
import { registerServiceWorker } from './pwa/register';

async function start() {
  await boot();
  const { default: App } = await import('../../App');
  AppRegistry.registerComponent('Atlas', () => App);
  AppRegistry.runApplication('Atlas', { rootTag: document.getElementById('root')! });
  document.getElementById('boot')?.remove();
  void registerServiceWorker();
}
void start();
