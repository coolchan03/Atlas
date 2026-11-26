/**
 * A roundtable as a podcast episode: each role keeps one voice (up to three), hidden turns and the person's own turns are
 * left out of the script, and the Study player plays it, exports its audio and saves its transcript like any other episode.
 */
import type { StudyResult } from '../study/store';
import { useStudyStore } from '../study/store';
import { hostOf, type Session } from './engine';
import { formatById } from './formats';

/** Where roundtable episodes are kept, one id per session, so they stay out of any project's study results. */
const episodeProject = (sessionId: string): string => `roundtable:${sessionId}`;

function toEpisode(s: Session, now: number = Date.now()): StudyResult {
  const human = new Set(s.roles.filter((r) => r.human).map((r) => r.id));
  const turns = s.turns.filter((t) => !t.hidden && !human.has(t.role));
  const speakers = new Set(turns.map((t) => hostOf(s, t.role))).size;
  const wordCount = turns.reduce((n, t) => n + t.text.split(/\s+/).filter(Boolean).length, 0);
  return {
    kind: 'podcast', createdAt: now, topic: s.topic, title: `${formatById(s.formatId)?.label ?? 'Roundtable'}: ${s.topic}`.slice(0, 90), sources: [],
    podcast: turns.map((t) => ({ host: hostOf(s, t.role), text: t.text })), hosts: Math.max(1, speakers), minutes: Math.max(1, Math.round(wordCount / 155)),
  };
}

/** Saves the episode and returns where to open it in the Study player. */
export function saveEpisode(s: Session): { projectId: string; openAt: number } {
  const episode = toEpisode(s);
  const projectId = episodeProject(s.id);
  useStudyStore.getState().add(projectId, episode);
  return { projectId, openAt: episode.createdAt };
}
