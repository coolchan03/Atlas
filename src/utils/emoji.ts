/**
 * Emojis and emoticons taken out of a text. Used in phone calls, where every word is read aloud (an emoji is read as its name, or not at
 * all) and the voice must sound like a person. Pure; written with explicit ranges so it works in every JS engine the app runs on.
 */
const PICTURES = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2300}-\u{23FF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}\u{203C}\u{2049}\u{2122}\u{2139}\u{24C2}\u{25AA}-\u{25FE}\u{3030}\u{303D}\u{3297}\u{3299}\u{E0020}-\u{E007F}]/gu;
/** :) ;-) :D :( :P =) 8) and the like, standing alone between spaces. */
const FACES = /(^|\s)[:;=8][-o^']?[)(DPpOo/\\|*\]\[]+(?=\s|$|[.,!?])/g;

export function stripEmoji(text: string): string {
  if (!text) return text;
  return text.replace(PICTURES, '').replace(FACES, '$1').replace(/[ \t]{2,}/g, ' ').replace(/ +([.,!?])/g, '$1');
}


/** Emoji pictures only. Unlike PICTURES this leaves the zero-width joiner alone: Indic and Persian scripts need it inside words. */
const EMOJI_ONLY = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2300}-\u{23FF}\u{20E3}\u{203C}\u{2049}\u{2122}\u{2139}\u{24C2}\u{25AA}-\u{25FE}\u{3030}\u{303D}\u{3297}\u{3299}\u{E0020}-\u{E007F}]️?/gu;
/** Soft hyphen, zero-width space, direction marks, word joiner, byte-order mark, variation selectors: nothing to say. */
const INVISIBLE = /[­​‎‏‪-‮⁠-⁤﻿︀-️]/g;
/** Control characters other than tab and line breaks. */
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
/** Private-use code points (icon fonts) and the replacement character: a voice has no word for them. */
const UNSPEAKABLE = /[-�\u{F0000}-\u{10FFFF}]/gu;
/** Box drawing and block elements, as used for tables and dividers in plain text. */
const DIVIDERS = /[─-▟]/g;

/**
 * Text made safe for a voice, for read-aloud, the briefing and calls alike: emoji, emoticons, invisible and control characters, icon-font
 * and divider characters come out. Everything a person would say stays: letters in every script (accents, Cyrillic, CJK, Arabic, Indic),
 * digits, punctuation, currency and unit signs ($ € £ % °), fractions, dashes and ellipses, and the joiners that sit inside words in some scripts.
 */
export function speechSafe(text: string): string {
  if (!text) return text;
  return text
    .replace(EMOJI_ONLY, '')
    // A joiner left standing at the edge of a word (what an emoji sequence leaves behind) goes; one inside a word stays.
    .replace(/(^|[\s\p{P}])[‌‍]+/gu, '$1')
    .replace(/[‌‍]+($|[\s\p{P}])/gu, '$1')
    .replace(INVISIBLE, '')
    .replace(CONTROL, '')
    .replace(UNSPEAKABLE, '')
    .replace(DIVIDERS, ' ')
    .replace(FACES, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +([.,!?])/g, '$1');
}
