import type { VoiceProfile } from './profiles';

/**
 * A briefing or podcast host's voice is either a voice name from the engine in use ("sid:3", a phone voice) or a saved voice
 * profile, written "profile:<id>". Profiles include cloned voices, which live in a different engine and are loaded when
 * their lines are rendered.
 */
export const PROFILE_PREFIX = 'profile:';

export const profileKey = (id: string): string => `${PROFILE_PREFIX}${id}`;
export const isProfileKey = (key: string | undefined): key is string => !!key && key.startsWith(PROFILE_PREFIX);

/** The saved profile a host voice refers to, if it still exists. */
export function profileForKey(key: string | undefined, profiles: VoiceProfile[]): VoiceProfile | undefined {
  return isProfileKey(key) ? profiles.find((p) => profileKey(p.id) === key) : undefined;
}

/** What makes the audio of a profile voice different, so a changed or re-recorded voice is never played from an old file. */
export function profileCacheKey(profile: Pick<VoiceProfile, 'voiceId' | 'sid' | 'referenceId'>): string {
  return `profile|${profile.voiceId}|${profile.sid}|${profile.referenceId ?? ''}`;
}

/** The name shown for a profile voice: its own name, and "cloned" when it is one. */
export const profileLabel = (p: Pick<VoiceProfile, 'name' | 'referenceId'>): string => `${p.name}${p.referenceId ? ' (cloned)' : ''}`;
