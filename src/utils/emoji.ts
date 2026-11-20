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

