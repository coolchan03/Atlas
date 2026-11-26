import { runPhoto } from '../../../src/photo/service';
import { modeById, PHOTO_MODES } from '../../../src/photo/modes';

const pic = { uri: 'file:///photo.jpg', mimeType: 'image/jpeg' };
const scripted = () => {
  const looks: string[] = []; const asks: { system: string; user: string }[] = []; const draws: { description: string; style?: string }[] = [];
  return {
    looks, asks, draws,
    deps: {
      look: async (_p: unknown, prompt: string) => { looks.push(prompt); return /sketch/.test(prompt) ? 'A house with a red roof and a tall tree.' : /narrate/.test(prompt) ? 'Waves roll in over pale sand.' : 'A harbour with fishing boats at dawn.'; },
      ask: async (system: string, user: string) => { asks.push({ system, user }); return /picture descriptions/.test(system) ? 'Old harbour, wooden boats, men mending nets' : 'Fishermen mended nets by hand on the quay, and the boats were wood.'; },
      draw: async (description: string, style?: string) => { draws.push({ description, style }); return '/Documents/painted.png'; },
    },
  };
};

describe('photo studio', () => {
  it('narrates in the chosen voice, in one look at the picture', async () => {
    const s = scripted();
    const r = await runPhoto({ mode: modeById('narrate'), choiceId: 'sports', picture: pic }, s.deps);
    expect(r.text).toBe('Waves roll in over pale sand.');
    expect(s.looks).toHaveLength(1);
    expect(s.looks[0]).toMatch(/excited sports commentator/);
    expect(s.looks[0]).toMatch(/never guess names/);
    expect(r.image).toBeNull();
  });

  it('the time machine looks first, writes the passage from what it saw, then paints it in the look of the era', async () => {
    const s = scripted();
    const r = await runPhoto({ mode: modeById('time'), choiceId: 'past100', picture: pic }, s.deps);
    expect(r.seen).toContain('harbour');
    expect(s.asks[0].user).toContain('A harbour with fishing boats at dawn.');
    expect(s.asks[0].user).toMatch(/about 100 years ago/);
    expect(s.asks[0].user).not.toMatch(/imagined/); // the past is not imagined
    expect(r.text).toMatch(/Fishermen mended nets/);
    expect(s.draws[0].style).toMatch(/black and white/);
    expect(r.image).toBe('/Documents/painted.png');
  });

  it('the future is said to be imagined', async () => {
    const s = scripted();
    await runPhoto({ mode: modeById('time'), choiceId: 'future50', picture: pic }, s.deps);
    expect(s.asks[0].user).toMatch(/imagined/);
  });

  it('a sketch is described and painted from the description in the chosen look, with no passage', async () => {
    const s = scripted();
    const r = await runPhoto({ mode: modeById('sketch'), choiceId: 'watercolor', picture: pic }, s.deps);
    expect(s.draws).toEqual([{ description: 'A house with a red roof and a tall tree.', style: 'watercolor painting, soft edges' }]);
    expect(r.text).toBe('');
    expect(r.image).toBe('/Documents/painted.png');
  });

  it('says plainly why there is no picture when the image model cannot paint or none is chosen', async () => {
    const s = scripted();
    const failing = { ...s.deps, draw: async () => { throw new Error('no memory'); } };
    const r = await runPhoto({ mode: modeById('sketch'), choiceId: 'photo', picture: pic }, failing);
    expect(r.image).toBeNull();
    expect(r.note).toBeTruthy();
    const none = await runPhoto({ mode: modeById('time'), choiceId: 'past50', picture: pic }, { look: s.deps.look, ask: s.deps.ask });
    expect(none.text).toMatch(/Fishermen/); // the passage still comes
    expect(none.note).toMatch(/Choose an image model/);
  });

  it('every mode has choices that are all different', () => {
    for (const m of PHOTO_MODES) expect(new Set(m.choices.map((c) => c.id)).size).toBe(m.choices.length);
  });

  it('an empty narration is an error, not a blank card', async () => {
    await expect(runPhoto({ mode: modeById('narrate'), picture: pic }, { look: async () => '<think>hm</think>  ' })).rejects.toThrow(/could not describe/);
  });
});
