/**
 * The everyday jobs on the workflow engine: repair help, cooking with what you have, explaining a letter, a writing
 * coach, explaining how something works, and reading a contract. Each shows its result and waits for approval,
 * then makes a note the person can save. See helpers.ts for the checks that code does on the AI's answers.
 */
import { extractJson, type Ask, type Workflow } from './engine';
import { allergenHits, claimLines, claims, hazardWarnings, list, lostNumbers, missingItems, section, text, type Claim } from './helpers';

const json = (reply: string): Record<string, any> => {
  const parsed = extractJson(reply);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('The AI did not answer in the expected form. Try again, or use a larger model.');
  return parsed as Record<string, any>;
};
const askJson = async (ask: Ask, system: string, user: string): Promise<Record<string, any>> => json(await ask(system, user.slice(0, 9000)));

// ------------------------------------------------------------------ repair
export interface RepairCtx {
  text: string; questions?: string[]; details?: string;
  causes?: Array<{ cause: string; check: string }>; steps?: string[]; stopIf?: string[]; callPro?: boolean; warnings?: string[]; note?: string;
}

export const repair: Workflow<RepairCtx> = {
  id: 'repair',
  title: 'Repair helper',
  summary: 'Describe what is broken. It asks a few questions, then gives likely causes, safe steps to try, and when to stop and call someone.',
  input: { help: 'Say what the item is and what it is doing wrong, for example: "front-loading washer, stops mid-cycle and shows E21".', minChars: 15, make: (t) => ({ text: t }) },
  steps: [
    { kind: 'model', id: 'questions', title: 'Think of questions', run: async (ctx, ask) => {
      const j = await askJson(ask, 'You help people fix household things. Reply with JSON only: {"questions":["up to 4 short questions whose answers would change the diagnosis"]}.', ctx.text);
      return { questions: list(j.questions, (q) => text(q, 140) || null, 4) };
    } },
    { kind: 'ask', id: 'answer', title: 'A few questions',
      questions: (ctx) => (ctx.questions ?? []).map((q, i) => ({ id: String(i), text: q, options: ['Yes', 'No', 'Not sure'] })),
      apply: (ctx, answers) => ({ details: (ctx.questions ?? []).map((q, i) => `${q} ${answers[String(i)] ?? 'Not sure'}`).join('\n') }) },
    { kind: 'model', id: 'diagnose', title: 'Work out causes and steps', run: async (ctx, ask) => {
      const j = await askJson(ask, 'You help people fix household things safely. Reply with JSON only: {"causes":[{"cause":"most likely first","check":"how to tell"}],"steps":["safe things to try, in order"],"stop_if":["signs to stop and call a professional"],"call_a_professional":true or false}. Never suggest bypassing a safety device. Use only the facts given.', `${ctx.text}\n${ctx.details ?? ''}`);
      return {
        causes: list(j.causes, (c) => (text(c?.cause) ? { cause: text(c.cause), check: text(c?.check) } : null), 5),
        steps: list(j.steps, (s) => text(s) || null, 10), stopIf: list(j.stop_if, (s) => text(s) || null, 6), callPro: j.call_a_professional === true,
      };
    } },
    { kind: 'code', id: 'safety', title: 'Check for danger', run: (ctx) => {
      const warnings = hazardWarnings(ctx.text, ctx.details ?? '', (ctx.steps ?? []).join(' '));
      return { warnings, callPro: ctx.callPro || warnings.length > 0 };
    } },
    { kind: 'confirm', id: 'review', title: 'Review',
      summary: (ctx) => `${ctx.warnings?.length ? `Safety first:\n- ${ctx.warnings.join('\n- ')}\n\n` : ''}Likely causes:\n${(ctx.causes ?? []).map((c, i) => `${i + 1}. ${c.cause}${c.check ? ` (check: ${c.check})` : ''}`).join('\n')}\n\nTry, in order:\n${(ctx.steps ?? []).map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\nStop and call someone if:\n${(ctx.stopIf ?? []).map((s) => `- ${s}`).join('\n') || '- Anything feels unsafe.'}${ctx.callPro ? '\n\nThis one is probably best left to a professional.' : ''}` },
    { kind: 'code', id: 'note', title: 'Make the checklist', run: (ctx) => ({ note: `# Repair: ${ctx.text.slice(0, 60)}\n\n${section('Safety', (ctx.warnings ?? []).map((w) => `- ${w}`))}${section('Likely causes', (ctx.causes ?? []).map((c) => `- ${c.cause}${c.check ? `: ${c.check}` : ''}`))}${section('Steps to try', (ctx.steps ?? []).map((s) => `- [ ] ${s}`))}${section('Stop and call someone if', (ctx.stopIf ?? []).map((s) => `- ${s}`))}` }) },
  ],
};

// ------------------------------------------------------------------ cooking
export interface Recipe { name: string; minutes: number; uses: string[]; missing: string[] }
export interface CookCtx {
  items: string[]; diners: number; avoid: string; minutes: number;
  ideas?: Recipe[]; chosen?: string; ingredients?: Array<{ item: string; amount: string }>; steps?: string[]; toBuy?: string[]; note?: string;
}

export const cook: Workflow<CookCtx> = {
  id: 'cook',
  title: 'Dinner from what I have',
  summary: 'List what is in the kitchen. It suggests dinners that use it, checks them against what you cannot eat, and writes the recipe with amounts for your group.',
  input: { help: 'List what you have, separated by commas or new lines. Salt, pepper, oil and water are assumed.', minChars: 6,
    fields: [
      { id: 'diners', label: 'How many people', options: ['1', '2', '4', '6'] },
      { id: 'time', label: 'Time you have', options: ['15 minutes', '30 minutes', '60 minutes'] },
      { id: 'avoid', label: 'Cannot or will not eat (optional)', placeholder: 'for example: peanuts, shellfish' },
    ],
    make: (t, f) => ({ items: t.split(/[,\n;]+/).map((x) => x.trim()).filter(Boolean), diners: Number(f.diners) || 2, minutes: Number.parseInt(f.time ?? '30', 10) || 30, avoid: f.avoid ?? '' }) },
  steps: [
    { kind: 'code', id: 'check', title: 'Check the list', run: (ctx) => { if (ctx.items.length < 2) throw new Error('List at least two things you have.'); return {}; } },
    { kind: 'model', id: 'ideas', title: 'Think of dinners', run: async (ctx, ask) => {
      const j = await askJson(ask, `You suggest simple home dinners. Reply with JSON only: {"recipes":[{"name":"","minutes":20,"uses":["ingredient names from the person's list"],"also_needs":["anything not on the list"]}]}. Give 3 ideas that use mostly what the person has and take at most ${ctx.minutes} minutes. Never include: ${ctx.avoid || 'nothing in particular'}.`, `On hand: ${ctx.items.join(', ')}`);
      const ideas = list(j.recipes, (r): Recipe | null => {
        const name = text(r?.name, 80);
        const uses = list(r?.uses, (u) => text(u, 60) || null, 12);
        if (!name || !uses.length) return null;
        const also = list(r?.also_needs, (u) => text(u, 60) || null, 8);
        return { name, minutes: Number(r?.minutes) || ctx.minutes, uses, missing: missingItems(ctx.items, [...uses, ...also]) };
      }, 3).filter((r) => allergenHits([...r.uses, r.name], ctx.avoid).length === 0);
      if (!ideas.length) throw new Error('No safe ideas came back. Add more items, or check what you listed as foods to avoid.');
      return { ideas };
    } },
    { kind: 'ask', id: 'pick', title: 'Pick one',
      questions: (ctx) => [{ id: 'pick', text: (ctx.ideas ?? []).map((r) => `${r.name} (${r.minutes} min)${r.missing.length ? `, you would also need: ${r.missing.join(', ')}` : ', uses only what you have'}`).join('\n'), options: (ctx.ideas ?? []).map((r) => r.name) }],
      apply: (ctx, a) => ({ chosen: a.pick ?? ctx.ideas?.[0]?.name }) },
    { kind: 'model', id: 'recipe', title: 'Write the recipe', run: async (ctx, ask) => {
      const j = await askJson(ask, `Write the recipe. Reply with JSON only: {"ingredients":[{"item":"","amount":"for ${ctx.diners} people"}],"steps":["short, numbered by order"]}. Keep it to what the person has plus salt, pepper, oil and water where you can. Never include: ${ctx.avoid || 'nothing in particular'}.`, `Recipe: ${ctx.chosen}. On hand: ${ctx.items.join(', ')}`);
      const ingredients = list(j.ingredients, (i) => (text(i?.item, 80) ? { item: text(i.item, 80), amount: text(i?.amount, 60) } : null), 25);
      const steps = list(j.steps, (s) => text(s, 240) || null, 15);
      if (!ingredients.length || !steps.length) throw new Error('The recipe came back incomplete. Try again.');
      return { ingredients, steps };
    } },
    { kind: 'code', id: 'verify', title: 'Check the recipe', run: (ctx) => {
      const hits = allergenHits((ctx.ingredients ?? []).map((i) => i.item), ctx.avoid);
      if (hits.length) throw new Error(`The recipe includes ${hits.join(', ')}, which you said to avoid. It was not used. Try again.`);
      return { toBuy: missingItems(ctx.items, (ctx.ingredients ?? []).map((i) => i.item)) };
    } },
    { kind: 'confirm', id: 'review', title: 'Review',
      summary: (ctx) => `${ctx.chosen} for ${ctx.diners}\n\n${(ctx.ingredients ?? []).map((i) => `- ${i.amount ? `${i.amount} ` : ''}${i.item}`).join('\n')}\n\n${(ctx.steps ?? []).map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\n${ctx.toBuy?.length ? `You would need to get: ${ctx.toBuy.join(', ')}.` : 'Everything is in your kitchen (plus salt, pepper, oil and water).'}` },
    { kind: 'code', id: 'note', title: 'Make the recipe card', run: (ctx) => ({ note: `# ${ctx.chosen}\nFor ${ctx.diners} people\n\n${section('Ingredients', (ctx.ingredients ?? []).map((i) => `- ${i.amount ? `${i.amount} ` : ''}${i.item}`))}${section('Method', (ctx.steps ?? []).map((s, i) => `${i + 1}. ${s}`))}${section('To buy', (ctx.toBuy ?? []).map((i) => `- ${i}`))}` }) },
  ],
};

// ------------------------------------------------------------------ explain a letter, label or error
export interface ExplainCtx { text: string; what?: string; plain?: string; urgent?: boolean; todo?: Claim[]; dates?: Claim[]; amounts?: Claim[]; note?: string }

export const explain: Workflow<ExplainCtx> = {
  id: 'explain',
  title: 'Explain this to me',
  summary: 'Paste a letter, label or error message. It says what it is in plain words and what to do, and shows the exact words it based each point on.',
  input: { help: 'Paste the text of a letter, notice, label or error message, or choose a file.', minChars: 20, make: (t) => ({ text: t }) },
  steps: [
    { kind: 'model', id: 'read', title: 'Read it', run: async (ctx, ask) => {
      const j = await askJson(ask, 'You explain official letters, labels and error messages in plain words. Reply with JSON only: {"what":"what this is","plain":"what it says, in 2 to 4 plain sentences","urgent":true or false,"todo":[{"text":"what to do","quote":"exact words from the text"}],"dates":[{"what":"","date":"","quote":"exact words"}],"amounts":[{"what":"","amount":"","quote":"exact words"}]}. Quote the text exactly. Use only what it says.', ctx.text);
      return { what: text(j.what, 120), plain: text(j.plain, 800), urgent: j.urgent === true, todo: claims(j.todo, ctx.text), dates: claims(j.dates, ctx.text), amounts: claims(j.amounts, ctx.text) };
    } },
    { kind: 'confirm', id: 'review', title: 'Review',
      summary: (ctx) => {
        const all = [...(ctx.todo ?? []), ...(ctx.dates ?? []), ...(ctx.amounts ?? [])];
        const bad = all.filter((c) => !c.verified).length;
        return `${ctx.what}${ctx.urgent ? ' (looks time-sensitive)' : ''}\n\n${ctx.plain}\n\nWhat to do:\n${(ctx.todo ?? []).map((c) => `- ${c.text}${c.verified ? '' : ' [not found in your text]'}`).join('\n') || '- Nothing asked of you.'}\n${(ctx.dates ?? []).map((c) => `Date: ${c.text}${c.verified ? '' : ' [not found in your text]'}`).join('\n')}\n${(ctx.amounts ?? []).map((c) => `Amount: ${c.text}${c.verified ? '' : ' [not found in your text]'}`).join('\n')}${bad ? `\n\n${bad} point${bad === 1 ? '' : 's'} could not be matched to your text. Check those against the original.` : ''}`;
      } },
    { kind: 'code', id: 'note', title: 'Make the note', run: (ctx) => {
      const todo = claimLines(ctx.todo ?? []); const dates = claimLines(ctx.dates ?? []); const amounts = claimLines(ctx.amounts ?? []);
      return { note: `# ${ctx.what}\n\n${ctx.plain}\n\n${section('What to do', todo.shown)}${section('Dates', dates.shown)}${section('Amounts', amounts.shown)}${section('Not found in the original text (check before relying on these)', [...todo.unchecked, ...dates.unchecked, ...amounts.unchecked])}` };
    } },
  ],
};

// ------------------------------------------------------------------ writing coach
export interface WritingCtx { text: string; mode: string; sample: string; rewrite?: string; lost?: string[]; note?: string }

export const writing: Workflow<WritingCtx> = {
  id: 'writing',
  title: 'Writing coach',
  summary: 'Shortens, clarifies or softens your own text, keeps every number and name, and can match your own style from a sample.',
  input: { help: 'Paste what you wrote. Optionally paste a sample of your own writing so the result sounds like you.', minChars: 20,
    fields: [
      { id: 'mode', label: 'What to do', options: ['Shorter', 'Clearer', 'Friendlier', 'More formal'] },
      { id: 'sample', label: 'A sample of your writing (optional)', placeholder: 'Paste a few sentences you wrote' },
    ], make: (t, f) => ({ text: t, mode: f.mode || 'Clearer', sample: f.sample ?? '' }) },
  steps: [
    { kind: 'model', id: 'rewrite', title: 'Rewrite', run: async (ctx, ask) => {
      const j = await askJson(ask, `Rewrite the person's text to be ${ctx.mode.toLowerCase()}. Keep every number, date, name and fact exactly. Do not add anything. ${ctx.sample ? 'Match the style of the sample. ' : ''}Reply with JSON only: {"rewrite":""}.`, `${ctx.sample ? `Sample of their style:\n${ctx.sample.slice(0, 1500)}\n\n` : ''}Text:\n${ctx.text}`);
      const rewrite = text(j.rewrite, 6000);
      if (!rewrite) throw new Error('No rewrite came back. Try again.');
      return { rewrite };
    } },
    { kind: 'code', id: 'check', title: 'Check nothing was lost', run: (ctx) => ({ lost: lostNumbers(ctx.text, ctx.rewrite ?? '') }) },
    { kind: 'confirm', id: 'review', title: 'Review',
      summary: (ctx) => `${ctx.rewrite}\n\n${ctx.mode === 'Shorter' ? `Length: ${ctx.text.length} to ${(ctx.rewrite ?? '').length} characters.\n` : ''}${ctx.lost?.length ? `Numbers from your text that are missing: ${ctx.lost.join(', ')}. Check before using it.` : 'Every number from your text is still there.'}` },
    { kind: 'code', id: 'note', title: 'Keep the result', run: (ctx) => ({ note: ctx.rewrite ?? '' }) },
  ],
};

// ------------------------------------------------------------------ how does this work
export interface HowCtx { text: string; summary?: string; parts?: Claim[]; watch?: string[]; note?: string }

export const howItWorks: Workflow<HowCtx> = {
  id: 'howitworks',
  title: 'Explain how it works',
  summary: 'Paste a code snippet, config file, spreadsheet formula or data format. It explains it part by part, quoting each part.',
  input: { help: 'Paste a code snippet, a config file, a formula, or a sample of a data file.', minChars: 10, make: (t) => ({ text: t }) },
  steps: [
    { kind: 'model', id: 'explain', title: 'Explain it', run: async (ctx, ask) => {
      const j = await askJson(ask, 'You explain how things work to a curious beginner. Reply with JSON only: {"summary":"2 to 3 sentences","parts":[{"text":"what this part does","quote":"the exact piece of the input"}],"watch_out":["common mistakes or surprises"]}. Quote the input exactly. If you are unsure what something does, say so.', ctx.text);
      return { summary: text(j.summary, 600), parts: claims(j.parts, ctx.text), watch: list(j.watch_out, (w) => text(w) || null, 6) };
    } },
    { kind: 'confirm', id: 'review', title: 'Review',
      summary: (ctx) => `${ctx.summary}\n\n${(ctx.parts ?? []).map((p) => `${p.verified ? `"${p.quote}"` : '(not a quote from your text)'}: ${p.text}`).join('\n')}${ctx.watch?.length ? `\n\nWatch out:\n${ctx.watch.map((w) => `- ${w}`).join('\n')}` : ''}` },
    { kind: 'code', id: 'note', title: 'Make the note', run: (ctx) => ({ note: `# How it works\n\n${ctx.summary}\n\n${section('Part by part', (ctx.parts ?? []).filter((p) => p.verified).map((p) => `- \`${p.quote}\`: ${p.text}`))}${section('Watch out', (ctx.watch ?? []).map((w) => `- ${w}`))}` }) },
  ],
};

// ------------------------------------------------------------------ contracts and leases
export interface ContractCtx { text: string; dates?: Claim[]; fees?: Claim[]; renewal?: Claim[]; cancel?: Claim[]; unusual?: Claim[]; note?: string }

export const contract: Workflow<ContractCtx> = {
  id: 'contract',
  title: 'Contract or lease reader',
  summary: 'Finds the key dates, fees, renewal and cancellation terms and anything unusual, each tied to the exact clause. A summary, not legal advice.',
  input: { help: 'Paste the text of a contract or lease, or choose a file.', minChars: 200, make: (t) => ({ text: t }) },
  steps: [
    { kind: 'model', id: 'read', title: 'Read the contract', run: async (ctx, ask) => {
      const j = await askJson(ask, 'You summarise contracts and leases for a non-lawyer. Reply with JSON only: {"dates":[{"what":"","date":"","quote":"exact clause words"}],"fees":[{"what":"","amount":"","quote":""}],"renewal":[{"text":"","quote":""}],"cancellation":[{"text":"","quote":""}],"unusual":[{"text":"why it stands out","quote":""}]}. Quote the text exactly. Include only what the text says.', ctx.text);
      return { dates: claims(j.dates, ctx.text), fees: claims(j.fees, ctx.text), renewal: claims(j.renewal, ctx.text), cancel: claims(j.cancellation, ctx.text), unusual: claims(j.unusual, ctx.text) };
    } },
    { kind: 'confirm', id: 'review', title: 'Review',
      summary: (ctx) => {
        const parts: Array<[string, Claim[] | undefined]> = [['Dates', ctx.dates], ['Fees', ctx.fees], ['Renewal', ctx.renewal], ['Cancellation', ctx.cancel], ['Unusual', ctx.unusual]];
        const body = parts.map(([title, items]) => `${title}:\n${(items ?? []).map((c) => `- ${c.text}${c.verified ? '' : ' [clause not found in your text]'}`).join('\n') || '- Nothing found'}`).join('\n\n');
        return `${body}\n\nThis is a summary to help you read the contract. It is not legal advice. Have a lawyer check anything important.`;
      } },
    { kind: 'code', id: 'note', title: 'Make the summary', run: (ctx) => {
      const make = (title: string, items?: Claim[]) => { const l = claimLines(items ?? []); return section(title, [...l.shown, ...l.unchecked.map((u) => `${u} [clause not found in the text]`)]); };
      return { note: `# Contract summary\n\nNot legal advice.\n\n${make('Dates', ctx.dates)}${make('Fees', ctx.fees)}${make('Renewal', ctx.renewal)}${make('Cancellation', ctx.cancel)}${make('Unusual', ctx.unusual)}` };
    } },
  ],
};
