import { advance, newSession, playerSays, wrapUp, cleanReply, hostOf, type Ask } from '../../../src/roundtable/engine';
import { formatById, formatDraws } from '../../../src/roundtable/formats';

const fmt = (id: string) => formatById(id)!;
/** A model that answers by who is speaking, and remembers every prompt it was given. */
const scripted = (answer: (system: string, user: string) => string) => {
  const prompts: { system: string; user: string }[] = [];
  const ask: Ask = async (system, user) => { prompts.push({ system, user }); return answer(system, user); };
  return { ask, prompts };
};
const who = (system: string) => /You are (\w[\w ]*?)\./.exec(system)?.[1] ?? '?';

describe('roundtable engine', () => {
  it('runs a debate in order and ends with the judge, each role under its own persona', async () => {
    const { ask, prompts } = scripted((system) => `${who(system)} makes a point about it.`);
    const s = await advance(newSession(fmt('debate'), { topic: 'Cars downtown', rounds: 2 }), { ask });
    expect(s.status).toBe('done');
    expect(s.turns.map((t) => t.name)).toEqual(['Pro', 'Con', 'Pro', 'Con', 'Pro', 'Con', 'Judge']);
    expect(prompts[0].system).toMatch(/argue FOR/);
    expect(prompts[1].system).toMatch(/argue AGAINST/);
    // The rebuttal is shown the other side's last turn.
    expect(prompts[2].user).toContain('Con: Con makes a point about it.');
  });

  it('jumps to the closing when the critic passes the draft', async () => {
    const { ask } = scripted((system) => (/Critic/.test(system) ? 'PASS. It reads well.' : 'Draft text.'));
    const s = await advance(newSession(fmt('critique'), { topic: 'An email', rounds: 4 }), { ask });
    expect(s.turns.map((t) => t.name)).toEqual(['Writer', 'Critic', 'Writer']); // draft, pass, final: no more rounds
    expect(s.status).toBe('done');
  });

  it('a game waits for the player, and the hidden referee keeps the state the narrator sees', async () => {
    const { ask, prompts } = scripted((system) => (/Referee/.test(system) ? 'PLACE: cellar. CARRYING: lamp.' : 'The narrator describes it. What do you do?'));
    let s = await advance(newSession(fmt('game'), { topic: 'A lighthouse door', rounds: 2 }), { ask });
    expect(s.status).toBe('waiting');
    expect(s.turns.filter((t) => !t.hidden).map((t) => t.name)).toEqual(['Narrator']);
    expect(s.state).toContain('CARRYING: lamp');
    s = await advance(playerSays(s, 'I open the door'), { ask });
    expect(s.status).toBe('waiting');
    const narratorPrompt = prompts.filter((p) => /Narrator/.test(p.system)).pop()!;
    expect(narratorPrompt.user).toContain('STATE:\nPLACE: cellar');
    expect(narratorPrompt.user).toContain('You: I open the door');
  });

  it('wrap up skips ahead to the closing step, and a failed turn is retried from where it stopped', async () => {
    let fail = true;
    const { ask } = scripted((system) => { if (fail && /Skeptic/.test(system)) { fail = false; throw new Error('model busy'); } return `${who(system)} speaks.`; });
    let s = await advance(newSession(fmt('panel'), { topic: 'Meals', rounds: 3 }), { ask });
    expect(s.status).toBe('error');
    expect(s.error).toMatch(/model busy/);
    const at = s.cursor;
    s = await advance(s, { ask });
    expect(s.cursor).toBeGreaterThan(at); // the failed turn was asked again
    s = wrapUp(await advance({ ...newSession(fmt('panel'), { topic: 'Meals', rounds: 3 }) }, { ask, shouldStop: () => false }));
    expect(s.status).toBe('done');
  });

  it('stops when asked and keeps what was written', async () => {
    let n = 0;
    const { ask } = scripted(() => 'A turn.');
    const s = await advance(newSession(fmt('panel'), { topic: 'Meals' }), { ask, shouldStop: () => n++ >= 3 });
    expect(s.status).toBe('stopped');
    expect(s.turns.length).toBeGreaterThan(0);
  });

  it('folds old turns into a summary so a long session keeps fitting', async () => {
    const { ask, prompts } = scripted((system, user) => (/shorten transcripts/.test(system) ? 'They argued about cost.' : `${who(system)} says something new ${user.length}.`));
    const s = await advance(newSession(fmt('debate'), { topic: 'Cars', rounds: 6 }), { ask });
    expect(s.summary).toBe('They argued about cost.');
    expect(prompts.some((p) => /Earlier in this session: They argued/.test(p.user))).toBe(true);
  });

  it('cleans a reply: no reasoning, no name prefix, no other role\'s line, but state lines and reasons are kept', () => {
    expect(cleanReply('<think>hmm</think>Pro: I agree.\nCon: And I do not.', 'Pro', { others: ['Con', 'Judge'] })).toBe('I agree.');
    expect(cleanReply('Verdict: Pro.\nReasons: it was better argued.', 'Judge', { others: ['Pro', 'Con'] })).toBe('Verdict: Pro.\nReasons: it was better argued.');
    expect(cleanReply('PLACE: cellar\nCARRYING: lamp\nGOAL: find the key', 'Referee')).toBe('PLACE: cellar\nCARRYING: lamp\nGOAL: find the key');
    expect(hostOf(newSession(fmt('teach'), { topic: 't' }), 'student')).toBe('B');
  });

  it('draws a narrator\'s scenes when pictures are on, and a picture that fails never stops the story', async () => {
    const { ask } = scripted((system) => (/Referee/.test(system) ? 'PLACE: cellar.' : 'You see a door. What do you do?'));
    const drawn: string[] = [];
    const illustrate = async (turn: { text: string }) => { drawn.push(turn.text); if (drawn.length === 2) throw new Error('no memory'); return `/Documents/scene-${drawn.length}.png`; };
    let s = await advance(newSession(fmt('game'), { topic: 'A door', rounds: 2, pictures: true }), { ask, illustrate });
    expect(s.turns.find((t) => t.role === 'gm')?.image).toBe('/Documents/scene-1.png');
    s = await advance(playerSays(s, 'open it'), { ask, illustrate });
    expect(s.status).toBe('waiting'); // the second picture failed and the story went on
    expect(s.turns.filter((t) => t.role === 'gm').map((t) => t.image)).toEqual(['/Documents/scene-1.png', undefined]);
    const off = await advance(newSession(fmt('game'), { topic: 'A door', rounds: 1 }), { ask, illustrate });
    expect(off.turns.some((t) => t.image)).toBe(false);
    expect(drawn).toHaveLength(2); // nothing was drawn for the session with pictures off
  });
});

describe('every roundtable format', () => {
  const { ROUNDTABLE_FORMATS } = require('../../../src/roundtable/formats');
  for (const { id } of ROUNDTABLE_FORMATS as { id: string }[]) {
    it(`${id} only uses its own roles, ends on a closing step, and only the person speaks at player steps`, () => {
      const f = fmt(id);
      const s = newSession(f, { topic: 'A topic', rounds: f.maxRounds });
      const ids = new Set(s.roles.map((r) => r.id));
      expect(s.steps.every((st) => ids.has(st.role))).toBe(true);
      expect(s.steps.filter((st) => st.kind === 'player').every((st) => s.roles.find((r) => r.id === st.role)?.human)).toBe(true);
      expect(s.steps.filter((st) => st.kind === 'hidden').every((st) => !s.roles.find((r) => r.id === st.role)?.human)).toBe(true);
      expect(s.steps[s.steps.length - 1].closing).toBe(true);
      if (f.state) expect(s.steps.some((st) => st.kind === 'hidden')).toBe(true); // a format with shared state has someone who keeps it
    });
  }

  it('an interview ends by writing up only what the person said', async () => {
    const { ask, prompts } = scripted(() => 'A reply.');
    let s = await advance(newSession(fmt('interview'), { topic: 'My grandmother', rounds: 2 }), { ask });
    s = await advance(playerSays(s, 'She kept bees.'), { ask });
    s = await advance(playerSays(s, 'Forty hives.'), { ask });
    expect(s.status).toBe('done');
    expect(prompts[prompts.length - 1].user).toContain('You: Forty hives.');
    expect(prompts[prompts.length - 1].user).toMatch(/using only what the person said/);
  });
});

describe('the shared state', () => {
  it('keeps every line of a long case file the referee writes, not just the first', async () => {
    const caseFile = ['SECRET: the baker, for the recipe', 'SUSPECTS: the baker, the miller, the courier', 'CLUES: flour on a sleeve; a torn note; a key; a late delivery', 'LEARNED: nothing yet'].join('\n').padEnd(1500, ' ');
    const { ask } = scripted((system) => (/Referee/.test(system) ? caseFile : 'The narrator speaks.'));
    const s = await advance(newSession(fmt('mystery'), { topic: 'A theft', rounds: 1 }), { ask });
    expect(s.state).toContain('CLUES: flour on a sleeve');
    expect(s.state).toContain('LEARNED: nothing yet');
  });
});

describe('a model for each role', () => {
  it('loads a role\'s model only when it changes, and puts the person\'s own model back at the end', async () => {
    const loads: Array<string | null> = [];
    const { ask } = scripted((system) => `${who(system)} speaks.`);
    const s = await advance(newSession(fmt('debate'), { topic: 'Cars', rounds: 2, roleModels: { pro: 'big', con: 'small' } }), { ask, useModel: async (id) => { loads.push(id); } });
    expect(s.status).toBe('done');
    // Pro and Con alternate, the judge has no model of its own (the person's), and the last call restores it.
    expect(loads).toEqual(['big', 'small', 'big', 'small', 'big', 'small', null]);
  });

  it('puts the person\'s own model back even when the run fails', async () => {
    const loads: Array<string | null> = [];
    const { ask } = scripted(() => { throw new Error('model busy'); });
    const s = await advance(newSession(fmt('debate'), { topic: 'Cars', roleModels: { pro: 'big' } }), { ask, useModel: async (id) => { loads.push(id); } });
    expect(s.status).toBe('error');
    expect(loads).toEqual(['big', null]);
  });

  it('a failure to load a role\'s model is reported as an error on that turn', async () => {
    const { ask } = scripted(() => 'x');
    const s = await advance(newSession(fmt('debate'), { topic: 'Cars', roleModels: { pro: 'gone' } }), { ask, useModel: async (id) => { if (id === 'gone') throw new Error('That model is no longer downloaded.'); } });
    expect(s.status).toBe('error');
    expect(s.error).toMatch(/no longer downloaded/);
    expect(s.cursor).toBe(0);
  });

  it('still puts the person\'s own model back when loading a role\'s model fails half way', async () => {
    const loads: Array<string | null> = [];
    const { ask } = scripted(() => 'x');
    const s = await advance(newSession(fmt('debate'), { topic: 'Cars', roleModels: { pro: 'big' } }), { ask, useModel: async (id) => { loads.push(id); if (id === 'big') throw new Error('out of memory'); } });
    expect(s.status).toBe('error');
    expect(loads).toEqual(['big', null]);
  });

  it('draws a tutor\'s examples and a memory\'s write-up, but nothing in a debate', async () => {
    const { ask } = scripted(() => 'A reply.');
    const drawn: string[] = [];
    const illustrate = async (turn: { name: string }) => { drawn.push(turn.name); return '/Documents/x.png'; };
    let t = await advance(newSession(fmt('teach'), { topic: 'Tides', rounds: 2, pictures: true }), { ask, illustrate });
    expect(t.status).toBe('waiting');
    expect(drawn).toEqual(['Tutor', 'Tutor']); // the two taught ideas, not the student's reaction or the answer
    drawn.length = 0;
    const d = await advance(newSession(fmt('debate'), { topic: 'Cars', rounds: 1, pictures: true }), { ask, illustrate });
    expect(d.status).toBe('done');
    expect(drawn).toEqual([]);
    expect(formatDraws(fmt('debate'))).toBe(false);
    expect(formatDraws(fmt('interview'))).toBe(true);
    expect(formatDraws(fmt('roleplay'))).toBe(true);
  });
});
