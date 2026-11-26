/**
 * Roundtable formats as data. A format names the roles and lays out the session as an ordered list of steps (who speaks,
 * and what they are asked to do). The engine runs the steps one after another with one model, each role under its own
 * persona. A format never decides how a turn is run: adding one is a new entry here and nothing else.
 */

export interface Role {
  id: string;
  name: string;
  persona: string;
  /** The person takes this role: the session waits for them at its steps. */
  human?: boolean;
  /** This role's turns can be drawn as a picture (a narrator's scene), when the person turns pictures on. */
  draws?: boolean;
}

export type StepKind = 'say' | 'player' | 'hidden';

export interface Step {
  role: string;
  kind: StepKind;
  instruction: string;
  /** A reply that matches this ends the discussion early: the session jumps to its closing step. */
  endsIf?: string;
  /** The closing step: where "wrap up" and an early end land. */
  closing?: boolean;
  /** Most sentences the speaker may use. */
  sentences?: number;
}

export interface RoundtableFormat {
  id: string;
  label: string;
  blurb: string;
  /** What to type in the topic box. */
  topicHint: string;
  roles: (topic: string) => Role[];
  plan: (rounds: number) => Step[];
  /** Rules every role follows in this format. */
  rules: string;
  defaultRounds: number;
  maxRounds: number;
  /** A shared state kept by a hidden role and shown to the others (a game's inventory and place). */
  state?: boolean;
}

const say = (role: string, instruction: string, more: Partial<Step> = {}): Step => ({ role, kind: 'say', instruction, ...more });
const times = <T>(n: number, make: (i: number) => T[]): T[] => Array.from({ length: n }, (_, i) => make(i)).flat();

const PLAIN = 'Speak in plain spoken sentences, as the person, with no headings, bullet points or stage directions. Never write the other roles\' lines. Facts come only from the topic, the notes and what was said so far; if you do not know, say so.';

export const ROUNDTABLE_FORMATS: RoundtableFormat[] = [
  {
    id: 'debate', label: 'Debate', blurb: 'Two sides argue, answer each other, and a judge scores the evidence.',
    topicHint: 'A question with two sides, e.g. Should cities ban cars downtown?',
    rules: `This is a debate. Disagree where it is reasonable to, answer the other side's last point directly, and never concede the whole case. ${PLAIN}`,
    defaultRounds: 3, maxRounds: 6,
    roles: () => [
      { id: 'pro', name: 'Pro', persona: 'You argue FOR the position in the topic. You are sharp, fair and specific.' },
      { id: 'con', name: 'Con', persona: 'You argue AGAINST the position in the topic. You are sharp, fair and specific.' },
      { id: 'judge', name: 'Judge', persona: 'You are a fair judge with no side. You judge only the quality of evidence and reasoning given in the debate, never your own opinion of the topic.' },
    ],
    plan: (rounds) => [
      say('pro', 'Opening: state your position and your two strongest reasons.'),
      say('con', 'Opening: state your position and your two strongest reasons.'),
      ...times(Math.max(0, rounds - 1), () => [
        say('pro', "Rebuttal: answer the other side's strongest point directly, then add one new argument."),
        say('con', "Rebuttal: answer the other side's strongest point directly, then add one new argument."),
      ]),
      say('pro', 'Closing: in two sentences, say why the evidence favours you.', { closing: true }),
      say('con', 'Closing: in two sentences, say why the evidence favours you.', { closing: true }),
      say('judge', 'Give the verdict. Begin with "Verdict: Pro", "Verdict: Con" or "Verdict: Draw", then give the two decisive reasons, and name the best single argument made by each side.', { closing: true, sentences: 6 }),
    ],
  },
  {
    id: 'panel', label: 'Writers\' room', blurb: 'An optimist, a skeptic and a specialist work a problem while a moderator keeps it on track.',
    topicHint: 'A problem or idea to work on, e.g. How should we plan a week of meals on a small budget?',
    rules: `This is a working discussion. Build on or push back on what was said before, and add something new each turn. ${PLAIN}`,
    defaultRounds: 3, maxRounds: 6,
    roles: () => [
      { id: 'mod', name: 'Moderator', persona: 'You chair the discussion: you frame the question, point at the real disagreement and keep it moving.' },
      { id: 'opt', name: 'Optimist', persona: 'You look for what could work and how to make it happen.' },
      { id: 'skep', name: 'Skeptic', persona: 'You look for what could go wrong, what is missing and what is assumed.' },
      { id: 'spec', name: 'Specialist', persona: 'You bring practical, concrete detail: numbers, steps, examples and how it is usually done.' },
    ],
    plan: (rounds) => [
      say('mod', 'Frame the question in two sentences and say what a good answer needs.'),
      ...times(rounds, () => [
        say('opt', 'Offer an idea or build on one.'),
        say('skep', 'Say what could go wrong with the last idea, or what it leaves out.'),
        say('spec', 'Add concrete detail that settles or sharpens the point.'),
        say('mod', 'Name the point they still disagree on and ask the next question.', { sentences: 2 }),
      ]),
      say('mod', 'Close: where they agree, where they still disagree, and the one next step. Use short plain sentences.', { closing: true, sentences: 6 }),
    ],
  },
  {
    id: 'redteam', label: 'Red team', blurb: 'One role defends your plan, another attacks it, and an auditor lists the real risks.',
    topicHint: 'Paste a plan to stress-test, e.g. I will quit my job in March and start a bakery',
    rules: `You are stress-testing the plan in the topic. Stay specific to that plan. ${PLAIN}`,
    defaultRounds: 3, maxRounds: 6,
    roles: () => [
      { id: 'def', name: 'Defender', persona: 'You own the plan. You defend it honestly and fix it when the attack is fair.' },
      { id: 'att', name: 'Attacker', persona: 'You try to make the plan fail. You find the most likely and most costly failure, never a far-fetched one.' },
      { id: 'aud', name: 'Auditor', persona: 'You are neutral. You weigh the attack and the defence and write down the risks that remain.' },
    ],
    plan: (rounds) => [
      say('def', 'Restate the plan in three sentences and name the main assumption it depends on.'),
      ...times(rounds, () => [
        say('att', 'Find the single most likely way this fails, and say why.'),
        say('def', 'Answer it: change the plan, or admit the risk stays.'),
      ]),
      say('aud', 'List the top five remaining risks as a numbered list. For each give severity (high, medium or low) and one mitigation.', { closing: true, sentences: 10 }),
    ],
  },
  {
    id: 'critique', label: 'Critique and revise', blurb: 'A writer drafts, a critic marks it up, the writer rewrites, until the critic passes it.',
    topicHint: 'What to write, e.g. A friendly email asking my landlord to fix the heating',
    rules: `You work on one piece of writing. ${PLAIN}`,
    defaultRounds: 3, maxRounds: 5,
    roles: () => [
      { id: 'writer', name: 'Writer', persona: 'You write clearly and revise without being defensive.' },
      { id: 'critic', name: 'Critic', persona: 'You are an exacting editor. You name the few fixes that matter most, never a long list.' },
    ],
    plan: (rounds) => [
      say('writer', 'Write the first draft in full.', { sentences: 12 }),
      ...times(rounds, () => [
        say('critic', 'Give the three most important fixes, briefly. If the draft needs no more fixes, reply with the single word PASS and one sentence why.', { endsIf: '\\bPASS\\b', sentences: 5 }),
        say('writer', 'Rewrite the whole piece with those fixes applied.', { sentences: 12 }),
      ]),
      say('writer', 'Present the final version only, with no commentary.', { closing: true, sentences: 12 }),
    ],
  },
  {
    id: 'teach', label: 'Tutor, student and quiz', blurb: 'A tutor teaches, a student asks the beginner questions, then an examiner quizzes you.',
    topicHint: 'What you want to learn, e.g. How does a refrigerator work?',
    rules: `This is a lesson that ends in a short quiz for the person. ${PLAIN}`,
    defaultRounds: 3, maxRounds: 6,
    roles: () => [
      { id: 'tutor', name: 'Tutor', persona: 'You are a patient teacher who uses one concrete example per idea and never moves on until the student has it.' },
      { id: 'student', name: 'Student', persona: 'You are a curious beginner. You restate what you heard in your own words, and you ask the question a beginner really would.' },
      { id: 'exam', name: 'Examiner', persona: 'You check understanding fairly. You test only what was taught in this session.' },
      { id: 'you', name: 'You', persona: 'The person learning.', human: true },
    ],
    plan: (rounds) => [
      ...times(rounds, () => [
        say('tutor', 'Teach ONE new idea about the topic in three or four sentences, with one concrete example. Do not repeat earlier ideas.'),
        say('student', 'Restate the idea in your own words, then ask one "wait, why?" question.', { sentences: 3 }),
        say('tutor', "Answer the student's question in two sentences.", { sentences: 3 }),
      ]),
      ...times(3, () => [
        say('exam', 'Ask ONE question that checks an idea taught above. Do not give the answer.', { sentences: 2 }),
        { role: 'you', kind: 'player' as const, instruction: 'Your answer.' },
        say('exam', 'Say whether the answer was right, partly right or wrong, and give the correct answer in one sentence. Judge only against what was taught.', { sentences: 3 }),
      ]),
      say('exam', 'Close: how many of the three were right, and the one idea to review. Two sentences.', { closing: true, sentences: 3 }),
    ],
  },
  {
    id: 'game', label: 'Game master', blurb: 'A narrator runs a story you play. A hidden referee tracks where you are and what you carry.',
    topicHint: 'The setting, e.g. A lighthouse keeper finds a door that was not there yesterday',
    rules: `This is an interactive story. The player decides what the player character does and says; you never do that for them. Stay consistent with STATE: do not invent items, places or people that contradict it. ${PLAIN}`,
    defaultRounds: 6, maxRounds: 20, state: true,
    roles: () => [
      { id: 'gm', name: 'Narrator', persona: 'You are a vivid, fair game master. You describe what the player sees and what happens because of what they did, then hand the choice back.', draws: true },
      { id: 'ref', name: 'Referee', persona: 'You keep the game honest. You record where the player is, what they carry, who they have met and what they are trying to do, exactly and briefly.' },
      { id: 'you', name: 'You', persona: 'The player.', human: true },
    ],
    plan: (rounds) => [
      say('gm', 'Set the scene: where the player is, what they can see, and one hook. Three to five sentences. End with "What do you do?"', { sentences: 5 }),
      { role: 'ref', kind: 'hidden', instruction: 'Write the STATE for the start of the game as lines: PLACE, CARRYING, PEOPLE, GOAL, FACTS. Under 80 words.' },
      ...times(rounds, () => [
        { role: 'you', kind: 'player' as const, instruction: 'What do you do?' },
        say('gm', 'Say what happens as a result of the player\'s action, consistent with STATE. Do not decide the player\'s next action. End by showing what they can do next.', { sentences: 5 }),
        { role: 'ref', kind: 'hidden' as const, instruction: 'Rewrite the whole STATE with what just changed (PLACE, CARRYING, PEOPLE, GOAL, FACTS). Under 120 words.' },
      ]),
      say('gm', 'Bring the story to a satisfying end in one paragraph, using what happened.', { closing: true, sentences: 6 }),
    ],
  },
  {
    id: 'mystery', label: 'Mystery', blurb: 'A case with suspects, clues and one culprit. You question them; a hidden referee keeps the facts straight.',
    topicHint: 'The setting, e.g. A theft at a village bakery the night before the fair',
    rules: `This is a murder-mystery style detective game with no violence shown. The case has exactly one culprit, a motive, and clues that make the answer deducible. The hidden SECRET in STATE is true and never contradicted. Reveal clues only when the player asks the right person the right thing; never name the culprit until the player accuses someone. ${PLAIN}`,
    defaultRounds: 8, maxRounds: 20, state: true,
    roles: () => [
      { id: 'gm', name: 'Narrator', persona: 'You narrate the case and speak for every suspect and witness, one at a time, each with their own voice and their own reasons to hide things. You play fair: every answer is consistent with STATE.', draws: true },
      { id: 'ref', name: 'Referee', persona: 'You design and keep the case: the culprit, the motive, three suspects with alibis (one false), and four clues. You record what the player has learned.' },
      { id: 'you', name: 'You', persona: 'The detective.', human: true },
    ],
    plan: (rounds) => [
      { role: 'ref', kind: 'hidden', instruction: 'Design the case for the topic. Write STATE as: SECRET (culprit, motive, how), SUSPECTS (three, with alibis, one alibi false), CLUES (four, each tied to who it points to), LEARNED (nothing yet). Under 160 words.' },
      say('gm', 'Open the case: where we are, what happened, who the three suspects are, in four or five sentences. Do not reveal SECRET. End with "Who do you want to question first?"', { sentences: 6 }),
      ...times(rounds, () => [
        { role: 'you', kind: 'player' as const, instruction: 'Ask a question, search somewhere, or accuse someone.' },
        say('gm', 'Answer as the person asked (or describe what the search finds), consistent with STATE. If the player accused someone, say whether they are right and stop there. Give clues only when earned.', { sentences: 5 }),
        { role: 'ref', kind: 'hidden' as const, instruction: 'Rewrite the whole STATE (keep SECRET, SUSPECTS and CLUES exactly) and update LEARNED with what the player now knows. Under 200 words.' },
      ]),
      say('gm', 'Reveal the solution: who did it, why, and which clues proved it. Say how well the player did. One paragraph.', { closing: true, sentences: 7 }),
    ],
  },
  {
    id: 'roleplay', label: 'Language role-play', blurb: 'Practice a real situation in another language. A coach corrects each message you send.',
    topicHint: 'Language and situation, e.g. Spanish: ordering at a market stall, I am a beginner',
    rules: `This is language practice. The topic names the language, the situation and the learner's level. The Partner speaks only in that language at that level. The Coach writes in English, except for the corrected sentences. ${PLAIN}`,
    defaultRounds: 6, maxRounds: 15,
    roles: () => [
      { id: 'partner', name: 'Partner', persona: 'You play the other person in the situation, naturally, in short sentences at the learner\'s level, in the target language only. You keep the conversation going with a question.' },
      { id: 'coach', name: 'Coach', persona: 'You are a kind language coach. You correct the learner\'s last message briefly: the better version first, then in one phrase why. If it was good, say so in a few words.' },
      { id: 'you', name: 'You', persona: 'The learner.', human: true },
    ],
    plan: (rounds) => [
      say('partner', 'Start the scene with one or two short sentences that fit the situation, and ask the learner something.', { sentences: 2 }),
      ...times(rounds, () => [
        { role: 'you', kind: 'player' as const, instruction: 'Reply in the language.' },
        say('coach', "Correct the learner's last message: give the better version, then say why in one short phrase. If it was fine, say so.", { sentences: 3 }),
        say('partner', 'Answer the learner naturally and ask the next thing, in the language, in one or two short sentences.', { sentences: 2 }),
      ]),
      say('coach', 'Close: name the three things the learner should practice next, one line each, with an example.', { closing: true, sentences: 6 }),
    ],
  },
  {
    id: 'interview', label: 'Interview', blurb: 'The app interviews you about a memory or a person, then writes the story from what you said.',
    topicHint: 'Whose story or which memory, e.g. My grandmother and the farm where she grew up',
    rules: `This is an interview. The Interviewer asks one question at a time and follows what the person just said. The write-up uses only what the person said, in their words where possible, and invents nothing. ${PLAIN}`,
    defaultRounds: 8, maxRounds: 20,
    roles: () => [
      { id: 'int', name: 'Interviewer', persona: 'You are a warm, curious interviewer. You ask one open question at a time, never two, and you follow up on a detail the person just gave: a name, a place, a feeling, a date.' },
      { id: 'you', name: 'You', persona: 'The person being interviewed.', human: true },
    ],
    plan: (rounds) => [
      say('int', 'Open: one friendly sentence, then the first question about the topic.', { sentences: 3 }),
      ...times(rounds, () => [
        { role: 'you', kind: 'player' as const, instruction: 'Your answer.' },
        say('int', 'Follow up on one specific detail in the last answer with one question. Do not summarize.', { sentences: 2 }),
      ]),
      say('int', 'Write the story in the first person, in two or three paragraphs, using only what the person said. Do not add facts. End with a line listing anything worth asking about next time.', { closing: true, sentences: 14 }),
    ],
  },
  {
    id: 'kid', label: 'Lesson for a child', blurb: 'A short story that teaches one topic at a child\'s age, then a gentle quiz.',
    topicHint: 'Topic and age, e.g. Why the sky is blue, for a 7-year-old',
    rules: `The topic names the subject and the child's age. Use words and examples that age knows, short sentences, and a friendly voice. Everything stated as fact must be true. ${PLAIN}`,
    defaultRounds: 2, maxRounds: 4,
    roles: () => [
      { id: 'story', name: 'Storyteller', persona: 'You teach through a short story with a friendly character and one clear idea per part. You speak to the child directly.', draws: true },
      { id: 'quiz', name: 'Quizmaster', persona: 'You ask kind, simple questions about the story and celebrate effort. You never make the child feel wrong.' },
      { id: 'you', name: 'You', persona: 'The child.', human: true },
    ],
    plan: (rounds) => [
      ...times(rounds, () => [say('story', 'Tell the next part of the story: one idea, one picture the child can imagine, four to six short sentences.', { sentences: 6 })]),
      ...times(3, () => [
        say('quiz', 'Ask one simple question about the story. Do not give the answer.', { sentences: 2 }),
        { role: 'you', kind: 'player' as const, instruction: 'Your answer.' },
        say('quiz', 'Say kindly whether that is right. If not quite, give the answer in one simple sentence.', { sentences: 3 }),
      ]),
      say('quiz', 'Close: say well done, name the one thing to remember, in two short sentences.', { closing: true, sentences: 3 }),
    ],
  },
];

export const formatById = (id: string): RoundtableFormat | undefined => ROUNDTABLE_FORMATS.find((f) => f.id === id);
