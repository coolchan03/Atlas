/**
 * The things Atlas says or shows that nobody asked for: reminders, tips, notices and the extra lines of the daily briefing. Each can be
 * switched off in Settings. One list here is the single source, so a new nudge is one entry and the card, the saved setting and the
 * checks follow. All are on by default. (Scheduled tasks have their own switch on the Scheduled tasks screen.)
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type NudgeId = 'homeStudy' | 'backupReminder' | 'speedTips' | 'statusNotices' | 'packTomorrow' | 'birthdays' | 'yourDay' | 'studyStreak' | 'reviewsDue' | 'weeklyDigest';

export interface NudgeInfo { id: NudgeId; group: 'Reminders and tips' | 'Daily briefing lines'; label: string; hint: string }

export const NUDGES: NudgeInfo[] = [
  { id: 'homeStudy', group: 'Reminders and tips', label: 'Study and reminders card on Home', hint: 'The card at the top of Home with what to study next, what is due and the exam countdown.' },
  { id: 'backupReminder', group: 'Reminders and tips', label: 'Back-up reminder', hint: 'A card on Home when it has been a while since your last backup.' },
  { id: 'speedTips', group: 'Reminders and tips', label: 'Speed tips in chat', hint: 'The line offering a speed test, or a fix when replies are slow.' },
  { id: 'statusNotices', group: 'Reminders and tips', label: 'Back-to-full-speed notices', hint: 'A short message when low-battery mode or the heat guard turns on or off.' },
  { id: 'packTomorrow', group: 'Daily briefing lines', label: 'Pack for tomorrow', hint: 'In the evening: an umbrella or a warmer jacket when the forecast calls for one.' },
  { id: 'birthdays', group: 'Daily briefing lines', label: 'Birthdays and anniversaries', hint: 'Said first when one is on your calendar today.' },
  { id: 'yourDay', group: 'Daily briefing lines', label: 'Scheduled tasks and battery', hint: 'Tasks that run later today, and a charge reminder when the battery is low.' },
  { id: 'studyStreak', group: 'Daily briefing lines', label: 'Study streak', hint: 'Your study streak, from three days on.' },
  { id: 'reviewsDue', group: 'Daily briefing lines', label: 'Review cards due', hint: 'How many review cards are due, and in which projects. Also shown as a card on Home.' },
  { id: 'weeklyDigest', group: 'Daily briefing lines', label: 'Monday digest', hint: 'What you made last week, and in which project.' },
];

type Flags = Record<NudgeId, boolean>;
const ALL_ON = Object.fromEntries(NUDGES.map((n) => [n.id, true])) as Flags;

interface NudgeState extends Flags { setNudge: (id: NudgeId, on: boolean) => void }

export const useNudges = create<NudgeState>()(persist((set) => ({
  ...ALL_ON,
  setNudge: (id, on) => set({ [id]: on } as Partial<Flags>),
}), {
  name: 'atlas-nudges',
  storage: createJSONStorage(() => AsyncStorage),
  partialize: (s) => Object.fromEntries(NUDGES.map((n) => [n.id, s[n.id]])) as Flags,
}));

/** Whether a nudge is on right now (for code that is not a component). */
export const nudgeOn = (id: NudgeId): boolean => useNudges.getState()[id] !== false;
