// react-native/Libraries/* deep imports (Text, TextInput, TextAncestorContext...) -> react-native-web.
import { Text, TextInput } from 'react-native-web';
import * as React from 'react';
export const TextAncestorContext = React.createContext(false);
export { Text, TextInput };
export default Text;
