import { prepareMessageForSpeech } from '../../src/utils/messageContent';

it('never speaks a bracketed note or stage direction, but keeps link text', () => {
  expect(prepareMessageForSpeech("Yo, Alex. How's it goin' man?\n\n[Text like a guy: lowercase, 1-2 emojis at most.]")).toBe("Yo, Alex. How's it goin' man?");
  expect(prepareMessageForSpeech('See [the docs](https://x.y) now [1].')).toBe('See the docs now .');
});
