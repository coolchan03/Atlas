import { createIcon } from './icons';
import glyphs from '../../../node_modules/react-native-vector-icons/glyphmaps/MaterialIcons.json';
import fontUrl from '../../../node_modules/react-native-vector-icons/Fonts/MaterialIcons.ttf?url';
export default createIcon('MaterialIcons', fontUrl, glyphs as Record<string, number>);
