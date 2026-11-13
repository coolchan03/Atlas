/**
 * Every voice a feature can be given, in one list: the profiles already saved, your cloned voices (even ones never saved as a
 * profile), the phone's own voice, and every speaker of the voices installed. Picking one that is not a saved profile yet saves it as
 * a profile, so a Home widget, a call or an agent can use any voice without a trip to Voice settings first. Pure, so it is tested
 * without a device.
 */
import { isPocketVoiceId } from './cloneRouting';
import type { VoiceProfile } from './profiles';
import type { VoiceReference } from './cloneStore';
import type { NeuralVoice } from './neural';

export type NewProfile = Omit<VoiceProfile, 'id' | 'createdAt'>;
export interface VoiceChoice { key: string; label: string; group: 'saved' | 'cloned' | 'installed'; profile?: VoiceProfile; make?: NewProfile }

const same = (p: VoiceProfile, v: { voiceId: string; sid: number; referenceId?: string }) => p.voiceId === v.voiceId && p.sid === v.sid && (p.referenceId ?? '') === (v.referenceId ?? '');

export function buildVoiceChoices(src: { profiles: VoiceProfile[]; references: VoiceReference[]; voices: NeuralVoice[]; installed: Record<string, number> }): VoiceChoice[] {
  const { profiles, references, voices, installed } = src;
  const out: VoiceChoice[] = profiles.map((p) => ({ key: p.id, label: p.referenceId ? `${p.name} (cloned)` : p.name, group: p.referenceId ? 'cloned' : 'saved', profile: p }));
  for (const r of references) {
    // Any pocket voice can speak with a reference; use the installed one.
    const model = Object.keys(installed).find(isPocketVoiceId);
    if (!model || profiles.some((p) => p.referenceId === r.id)) continue;
    out.push({ key: `clone:${r.id}`, label: `${r.name} (cloned)`, group: 'cloned', make: { name: r.name, voiceId: model, sid: 0, rate: 1, referenceId: r.id } });
  }
  if (!profiles.some((p) => same(p, { voiceId: '', sid: 0 }))) out.push({ key: 'engine::0', label: 'Phone voice', group: 'installed', make: { name: 'Phone voice', voiceId: '', sid: 0, rate: 1 } });
  for (const v of voices) {
    if (installed[v.id] === undefined || isPocketVoiceId(v.id)) continue;
    for (const s of v.speakers ?? [{ sid: 0, name: '' }]) {
      if (profiles.some((p) => same(p, { voiceId: v.id, sid: s.sid }))) continue;
      const name = s.name ? `${v.name} ${s.name}` : v.name;
      out.push({ key: `engine:${v.id}:${s.sid}`, label: name, group: 'installed', make: { name, voiceId: v.id, sid: s.sid, rate: 1 } });
    }
  }
  return out;
}

/** The id of the saved profile for a choice, saving it first when it is a voice that was never saved. */
export function profileIdFor(choice: VoiceChoice, addProfile: (p: NewProfile) => VoiceProfile): string {
  if (choice.profile) return choice.profile.id;
  return addProfile(choice.make!).id;
}
