// Imported first thing in index.js, before any screen module loads, so every Text and TextInput
// in the app is the appearance-aware version. The saved choice is applied by startTextAppearance.
import { installTextAppearance } from './globalText';

installTextAppearance();
