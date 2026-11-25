import { AppRegistry } from 'react-native-web';
import './native';
import App from '../../App';

AppRegistry.registerComponent('Atlas', () => App);
AppRegistry.runApplication('Atlas', { rootTag: document.getElementById('root')! });
document.getElementById('boot')?.remove();
