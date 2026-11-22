import { TRANSLATOR_LANGUAGES, languageFor, searchLanguages } from '../../../src/translator/languages';
import { bothWaysMessages, cleanTranslation, parseDirected, parsePicture, pictureMessages, textMessages } from '../../../src/translator/translate';

const en = languageFor('en-US');
const es = languageFor('es-ES');

describe('the languages', () => {
  it('have unique codes and can be searched by English or native name', () => {
    expect(new Set(TRANSLATOR_LANGUAGES.map((l) => l.code)).size).toBe(TRANSLATOR_LANGUAGES.length);
    expect(searchLanguages('xyz')).toEqual([]);
    expect(searchLanguages('Español').map((l) => l.code)).toEqual(['es-ES']);
    expect(searchLanguages('chinese').map((l) => l.code)).toEqual(['zh-CN', 'zh-TW']);
    expect(searchLanguages('')).toHaveLength(TRANSLATOR_LANGUAGES.length);
  });
  it('give an unknown saved code a stand-in rather than failing', () => { expect(languageFor('xx-XX')).toEqual({ code: 'xx-XX', name: 'xx-XX', native: 'xx-XX' }); });
});

describe('the prompts', () => {
  it('text mode names both languages, or lets the AI recognise the first', () => {
    expect(textMessages('Hello', en, es)[0].content).toMatch(/from English into Spanish/);
    expect(textMessages('Hello', null, es)[0].content).toMatch(/from whatever language it is written in into Spanish/);
    expect(textMessages('Hello', en, es)[1]).toMatchObject({ role: 'user', content: 'Hello' });
  });
  it('conversation mode asks which side it was translated into', () => {
    expect(bothWaysMessages('Hola', en, es)[0].content).toMatch(/TO: A.*English.*TO: B.*Spanish/);
  });
  it('picture mode attaches the picture to the request', () => {
    const attachment = { id: 'a', type: 'image', uri: 'file:///x.jpg' };
    expect(pictureMessages(attachment, en)[0].attachments).toEqual([attachment]);
  });
});

describe('reading the answers', () => {
  it('cleans a translation', () => {
    expect(cleanTranslation('<think>hmm</think>Translation: "Buenos días"')).toBe('Buenos días');
    expect(cleanTranslation('```\nHola\n```')).toBe('Hola');
    expect(cleanTranslation('He said "hi" and "bye"')).toBe('He said "hi" and "bye"');
    expect(cleanTranslation('“Hasta luego”')).toBe('Hasta luego');
  });
  it('reads which side a conversation turn went to', () => {
    expect(parseDirected('TO: B\nHola, ¿cómo estás?')).toEqual({ to: 'B', text: 'Hola, ¿cómo estás?' });
    expect(parseDirected('to: a Where is the station?')).toEqual({ to: 'A', text: 'Where is the station?' });
    expect(parseDirected('Just a translation')).toEqual({ to: null, text: 'Just a translation' });
  });
  it('reads a picture: the text found and its translation, or that there was none', () => {
    expect(parsePicture('ORIGINAL:\nSalida\nTRANSLATION:\nExit')).toEqual({ found: true, original: 'Salida', translation: 'Exit' });
    expect(parsePicture('NO TEXT')).toEqual({ found: false, original: '', translation: '' });
    expect(parsePicture('Exit')).toEqual({ found: true, original: '', translation: 'Exit' });
  });
});
