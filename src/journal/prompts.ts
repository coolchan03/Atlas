/** Questions for a journal page. One is chosen for each day (the same all day), and "Another" moves to the next. Plain data, no AI. */
export const PROMPTS: string[] = [
  'What is one thing that went well today?', 'What is on your mind right now?', 'Who did you talk to today, and how did it feel?', 'What are you looking forward to this week?',
  'What was hard today, and what helped?', 'What did you learn today?', 'Describe a small moment you want to remember.', 'What are you grateful for today?',
  'What would make tomorrow a good day?', 'What did you do for your body today?', 'What is something you keep putting off? What is the smallest first step?', 'What made you laugh recently?',
  'What are you proud of this week?', 'Is anything worrying you? What can you do about it, and what can you let go?', 'Where did your time go today?', 'What do you want to remember about this time in your life?',
  'Write about someone you appreciate.', 'What did you eat today that you enjoyed?', 'What did you notice outside today?', 'What would you tell yourself a year ago?',
  'What is a decision you are facing? What do you lean towards, and why?', 'How is your energy today, and what affects it?', 'What is something you want to get better at?', 'What did you finish today, however small?',
  'Describe your ideal ordinary day.', 'What was the best part of your morning?', 'What are you avoiding? Why?', 'What song, book or show has been on your mind?',
  'What did you do today that you did not have to?', 'What would you like to say to someone and have not?', 'What is one thing you would change about this week?', 'What are three things you can see, hear and feel right now?',
  'What do you want less of in your life? What do you want more of?', 'What is a problem you solved recently?', 'Who helped you lately, and have you thanked them?', 'What is a memory that made you smile today?',
  'How did you rest today?', 'What are you curious about?', 'What did you spend money on today, and was it worth it?', 'Write down one plan for tomorrow.',
];

const DAY_MS = 86_400_000;

/** The prompt for a day ("2026-11-24"), moved on by `more` for each press of "Another". */
export function promptFor(day: string, more = 0): string {
  const t = Date.parse(`${day}T00:00:00Z`);
  const index = Number.isFinite(t) ? Math.floor(t / DAY_MS) : 0;
  return PROMPTS[(((index + more) % PROMPTS.length) + PROMPTS.length) % PROMPTS.length];
}
