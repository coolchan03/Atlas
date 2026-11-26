/**
 * A podcast made from a course ("Learn a topic"): the lessons already written become the sources, the same episode writer
 * as Study mode makes the script, and the result is kept where the Study player can play it. One writer for both screens.
 */
import { writeEpisode, trimSources, useStudyStore, type Source } from '../study/engine';
import type { StudyResult } from '../study/store';
import type { PodcastChoices } from '../components/PodcastOptionsForm';
import type { Course } from './store';

/** A course's episodes are kept under one id of their own, so they never mix into a project's study results. */
export const coursePodcastProject = (courseId: string): string => `course-podcast:${courseId}`;

/** What each written lesson says, as numbered sources (headings, text, examples and key points), in board order. */
export function courseSources(course: Course): Source[] {
  const out: Source[] = [];
  for (const sq of course.squares) {
    const c = course.content[sq.key];
    if (c?.kind !== 'lesson') continue;
    const text = [
      ...c.sections.map((s) => `${s.heading}. ${s.text}${s.example ? ` For example: ${s.example}` : ''}`),
      c.keyPoints.length ? `Key points: ${c.keyPoints.join('; ')}` : '',
    ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    if (text) out.push({ n: out.length + 1, doc: sq.title, part: out.length + 1, text: text.slice(0, 1400) });
  }
  return out;
}

const wordsOf = (t: string): string[] => t.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3);

/** The lessons that share the most words with a part's topic (for long episodes, where each part reads its own lessons). */
export function lessonsAbout(all: Source[], topic: string, count = 3): Source[] {
  const want = new Set(wordsOf(topic));
  return all
    .map((x) => ({ x, score: wordsOf(`${x.doc} ${x.text}`).filter((w) => want.has(w)).length }))
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .map(({ x }, i) => ({ ...x, n: i + 1, text: x.text.slice(0, 900) }));
}

/** How many lessons of the course are written (an episode needs at least one). */
export const writtenLessons = (course: Course): number => courseSources(course).length;

/**
 * Writes an episode from a course's lessons and keeps it. Returns the saved result; open it in the Study player with
 * `{ projectId: coursePodcastProject(course.id), openAt: result.createdAt }`.
 */
export async function makeCoursePodcast(
  course: Course, choices: PodcastChoices, run: { onStep: (m: string) => void; shouldStop?: () => boolean },
): Promise<StudyResult> {
  const all = courseSources(course);
  if (!all.length) throw new Error('This course has no written lessons yet. Play or write a lesson first, then make the podcast.');
  // The planner sees a short extract of every lesson, so the episode covers the whole course and not only its first lessons.
  const per = Math.max(200, Math.floor(2400 / all.length));
  const sources = trimSources(all.map((x) => ({ ...x, text: x.text.slice(0, per) })));
  const result = await writeEpisode(sources, {
    prompt: choices.prompt.trim() || `the course "${course.title}"`,
    minutes: choices.minutes, hosts: choices.hosts, style: choices.style, research: false, title: course.title, shouldStop: run.shouldStop,
    sourcesFor: async (topic) => lessonsAbout(all, topic),
  }, run.onStep);
  useStudyStore.getState().add(coursePodcastProject(course.id), result);
  return result;
}
