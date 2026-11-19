import { EndOfSpeechDetector, CALL_END_OF_SPEECH } from '../../../src/atlasVoice/endOfSpeech';

it('ends the turn after a quiet talker stops, without a tap', () => {
  const d = new EndOfSpeechDetector(0, CALL_END_OF_SPEECH);
  let t = 0;
  for (let i = 0; i < 4; i++) d.push(0.004, (t += 100)); // room
  for (let i = 0; i < 10; i++) expect(d.push(0.016, (t += 100))).toBe('none'); // a soft voice
  let verdict = 'none';
  for (let i = 0; i < 14 && verdict === 'none'; i++) verdict = d.push(0.004, (t += 100));
  expect(verdict).toBe('end');
});
