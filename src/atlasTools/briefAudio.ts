/** Makes the audio file of a briefing that is already written (used by a scheduled briefing, so it is ready to play or share when you wake). */
import { BRIEF_PROJECT, STORY_PAUSE_SECONDS, useBriefPrefs } from './dailyBrief';
import { castLine } from '../atlasVoice/podcastAudio';
import { exportEpisodeAudio, type EpisodeAudio } from '../atlasVoice/briefingAudio';
import { audioFor } from '../atlasVoice/episodeAudioStore';
import { listVoices } from '../atlasVoice/tts';
import type { StudyResult } from '../study/store';

/** The briefing as one audio file in the voices, tunes and pauses the person set; one already made for it is kept, not made again. */
export async function saveBriefingAudio(record: StudyResult): Promise<EpisodeAudio> {
  const key = `${BRIEF_PROJECT}-${record.createdAt}`;
  const have = await audioFor(key);
  if (have) return have;
  const prefs = useBriefPrefs.getState();
  const voices = await listVoices('en').catch(() => []);
  const items = (record.podcast ?? []).map((l) => ({ text: l.text, ...castLine(l.host, record.hosts ?? 2, voices) }));
  const tunes = prefs.jingles !== false ? { storyStarts: record.storyStarts ?? [], pauseSeconds: STORY_PAUSE_SECONDS, intro: true } : undefined;
  return exportEpisodeAudio(key, items, { title: record.title || 'Daily briefing', tunes, jingleVolume: prefs.jingleVolume ?? 'normal' });
}
