import { useRef, useState } from 'react';
import { Alert } from 'react-native';
import { pick, types, isErrorWithCode, errorCodes } from '@react-native-documents/picker';
import { documentService } from '../services/documentService';
import { readAloud, useReadAloud } from './readAloud';

/** The longest document opened for reading (about seven hours of speech). */
const MAX_CHARS = 400_000;
export const wordCount = (text: string) => (text.trim() ? text.trim().split(/\s+/).length : 0);

/** The text to read: typed or pasted, or a document opened from the phone. Shared by the Read aloud screen and its Home widget. */
export function useReadAloudSource() {
  const [typed, setTyped] = useState('');
  const [document, setDocument] = useState<{ title: string; text: string } | null>(null);
  const [opening, setOpening] = useState(false);
  const loaded = useRef('');
  const text = document?.text ?? typed;

  const openDocument = async () => {
    if (opening) return;
    setOpening(true);
    try {
      const [file] = await pick({ type: [types.allFiles], allowMultiSelection: false });
      if (!file) return;
      const name = file.name || 'document';
      if (!documentService.isSupported(name)) {
        Alert.alert('Unsupported file', `"${name}" cannot be read aloud. Try PDF, Word, text, Markdown, EPUB or another document.`);
        return;
      }
      const body = await documentService.textFromPicked(file.uri, name, MAX_CHARS);
      if (!body.trim()) { Alert.alert('Nothing to read', `"${name}" has no text in it.`); return; }
      readAloud.stop();
      setDocument({ title: name, text: body });
    } catch (e: any) {
      if (!(isErrorWithCode(e) && e.code === errorCodes.OPERATION_CANCELED)) Alert.alert('Could not open the file', String(e?.message || e));
    } finally { setOpening(false); }
  };

  const clear = () => { readAloud.stop(); setDocument(null); setTyped(''); loaded.current = ''; };
  /** Starts reading, from the top when the text changed since it was last loaded. */
  const play = () => {
    if (!text.trim()) return;
    if (loaded.current !== text || !useReadAloud.getState().parts.length) { readAloud.load(text, document?.title ?? ''); loaded.current = text; }
    readAloud.play();
  };
  return { typed, setTyped, document, opening, text, words: wordCount(text), openDocument, clear, play };
}
