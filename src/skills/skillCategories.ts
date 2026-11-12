/** Skills grouped by what they are for, so the list reads as a handful of choices instead of thirty names. */
export interface SkillCategory { id: string; title: string; hint: string; names: string[] }

export const SKILL_CATEGORIES: SkillCategory[] = [
  { id: 'explain', title: 'Explain and teach', hint: 'Make something clear',
    names: ['summarize', 'explain-simply', 'code-explainer', 'socratic-method'] },
  { id: 'make', title: 'Make something', hint: 'Quizzes, flashcards, tables, notes and ideas',
    names: ['study-quiz', 'flashcards', 'text-to-table', 'meeting-notes', 'brainstorm'] },
  { id: 'rewrite', title: 'Rewrite and fix writing', hint: 'Proofread, change the tone, answer messages',
    names: ['proofread', 'rewrite-tone', 'email-reply'] },
  { id: 'language', title: 'Change how it is written', hint: 'Plain, simple or controlled language and special styles',
    names: ['simplified-technical-english', 'basic-english', 'plain-legal-language', 'special-english-voa', 'procedure-controlled-language',
      'zero-adjective', 'phenomenological-description', 'historical-era-voice', 'pseudocode-to-prose'] },
  { id: 'think', title: 'Think and decide', hint: 'Careful reasoning, checking facts, solving problems',
    names: ['math-steps', 'decision-helper', 'fact-check-careful', 'grounded-answers', 'first-principles', 'steelman-redteam', 'morphological-analysis'] },
  { id: 'life', title: 'Plan your life', hint: 'Trips, meals and your day',
    names: ['trip-planner', 'recipe-from-ingredients', 'daily-planner'] },
];

/** Skills the person added themselves, which belong to no ready-made group. */
export const OWN_CATEGORY: SkillCategory = { id: 'own', title: 'My own skills', hint: 'Skills you added from a file or pasted text', names: [] };

/** The group a skill belongs to; anything not in a ready-made group is the person's own. */
export function categoryOf(name: string): SkillCategory {
  return SKILL_CATEGORIES.find((c) => c.names.includes(name)) ?? OWN_CATEGORY;
}
