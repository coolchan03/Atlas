import React from 'react';
import { onMissingLanguage } from '../atlasVoice/tts';

/** A note for when the phone has no voice installed for the language being spoken (null until that happens). */
export function useMissingVoice(languageName: string): string | null {
  const [note, setNote] = React.useState<string | null>(null);
  const name = React.useRef(languageName);
  name.current = languageName;
  React.useEffect(() => {
    onMissingLanguage(() => setNote(`Your phone has no ${name.current} voice yet. Open Settings > Text-to-speech and install the voice data for ${name.current}, then try again.`));
    return () => onMissingLanguage(null);
  }, []);
  return note;
}
