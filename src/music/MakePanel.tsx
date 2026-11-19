import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../theme';
import { SPACING, TYPOGRAPHY } from '../constants';
import { Select, type SelectOption } from '../components/Select';
import { STYLES, type Energy, type StyleMood } from './styles';
import { INSTRUMENTS } from './catalog';
import { AMBIENT, type AmbientKind } from './ambient';
import { instrumentsOf } from './simple';

export type Maker = 'ai' | 'quick' | 'noise';
export type SoundChoice = 'synth' | 'soundfont';

const MAKERS: SelectOption[] = [
  { id: 'ai', label: 'AI composer', hint: 'Writes a score on your phone; takes a minute or two' },
  { id: 'quick', label: 'Quick tune (no AI)', hint: 'The built-in composer, at once' },
  { id: 'noise', label: 'Background noise', hint: 'Rain, ocean, white noise and more: not music' },
];
const ENERGIES: SelectOption[] = [{ id: 'calm', label: 'Calm' }, { id: 'medium', label: 'Medium' }, { id: 'lively', label: 'Lively' }];
const LENGTHS: SelectOption[] = [{ id: '30', label: '30 seconds' }, { id: '60', label: '1 minute' }, { id: '90', label: '90 seconds' }];
const STYLE_OPTIONS: SelectOption[] = (Object.keys(STYLES) as StyleMood[]).map((id) => ({ id, label: STYLES[id].label, hint: STYLES[id].group }));
const INSTRUMENT_OPTIONS: SelectOption[] = INSTRUMENTS.map((i) => ({ id: i.id, label: i.label, hint: i.family }));
const NOISE_OPTIONS: SelectOption[] = AMBIENT.map((a) => ({ id: a.id, label: a.label, hint: a.note }));

export interface MakeChoices {
  prompt: string; mood: StyleMood; energy: Energy; seconds: number; maker: Maker; instruments: string[]; noise: AmbientKind; sound: SoundChoice;
}

/** What the "Make it" button says for each way of making music. */
export const makeLabel = (maker: Maker): string => (maker === 'ai' ? 'Compose with AI' : maker === 'quick' ? 'Make a quick tune' : 'Make the sound');

/**
 * The one place to say what to make: what it should be like (words), and drop-downs for the style, how lively, how long, who makes it,
 * which instruments and which sound. "Background noise" swaps the style, liveliness and instrument choices for a list of noises.
 */
export function MakePanel({ choices, onChange, soundfontName, busy, onMake, onSurprise, onImport }: {
  choices: MakeChoices; onChange: (patch: Partial<MakeChoices>) => void; soundfontName?: string | null; busy: boolean; onMake: () => void; onSurprise: () => void; onImport: () => void;
}) {
  const { colors } = useTheme();
  const { maker, mood } = choices;
  const music = maker !== 'noise';
  const ai = maker === 'ai';
  const soundOptions: SelectOption[] = [
    { id: 'synth', label: 'Built-in synthesiser', hint: 'Always available' },
    { id: 'soundfont', label: soundfontName ? `Real instruments (${soundfontName})` : 'Real instruments (add a SoundFont under Sound and playback)', hint: soundfontName ? 'Recorded instruments, more natural' : 'No SoundFont installed yet' },
  ];
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]} testID="music-make-panel">
      <Select label="Made by" options={MAKERS} value={maker} onChange={(id) => onChange({ maker: id as Maker })} disabled={busy} testID="music-maker" />
      {music && (
        <>
          <Text style={[styles.label, { color: colors.text }]}>{ai ? 'What should the AI composer write?' : 'What should it sound like? (optional)'}</Text>
          <TextInput value={choices.prompt} onChangeText={(prompt) => onChange({ prompt })} multiline maxLength={200} testID="music-prompt"
            placeholder="e.g. a rainy day jazz cafe, slow, with piano, upright bass and a saxophone" placeholderTextColor={colors.textMuted}
            style={[styles.input, { color: colors.text, borderColor: colors.border }]} />
          <View style={styles.grid}>
            <View style={styles.half}><Select label="Style" options={STYLE_OPTIONS} value={mood} onChange={(id) => onChange({ mood: id as StyleMood })} disabled={busy} testID="music-style" /></View>
            <View style={styles.half}><Select label="How lively" options={ENERGIES} value={choices.energy} onChange={(id) => onChange({ energy: id as Energy })} disabled={busy} testID="music-energy" /></View>
            <View style={styles.half}><Select label="Length" options={LENGTHS} value={String(choices.seconds)} onChange={(id) => onChange({ seconds: Number(id) })} disabled={busy} testID="music-length" /></View>
            <View style={styles.half}><Select label="Sound" options={soundOptions} value={choices.sound} onChange={(id) => onChange({ sound: id as SoundChoice })} disabled={busy} testID="music-sound" /></View>
          </View>
          {ai && <Select label="Instruments to use" options={INSTRUMENT_OPTIONS} multiple values={choices.instruments} onToggle={(id) => onChange({ instruments: choices.instruments.includes(id) ? choices.instruments.filter((x) => x !== id) : [...choices.instruments, id] })}
            summary={choices.instruments.length ? choices.instruments.map((id) => INSTRUMENTS.find((i) => i.id === id)?.label ?? id).join(', ') : 'Let the composer choose'} disabled={busy} testID="music-instruments" />}
          <Text style={[styles.hint, { color: colors.textMuted }]} testID="music-plays">{STYLES[mood].label} plays: {instrumentsOf(mood)}.</Text>
        </>
      )}
      {!music && <Select label="Noise" options={NOISE_OPTIONS} value={choices.noise} onChange={(id) => onChange({ noise: id as AmbientKind })} disabled={busy} testID="music-noise" />}
      <TouchableOpacity onPress={onMake} disabled={busy} testID={ai ? 'music-ai-composer' : maker === 'quick' ? 'music-quick' : 'music-noise-make'} accessibilityRole="button"
        style={[styles.make, { backgroundColor: colors.primary }, busy && styles.busy]}>
        {busy ? <ActivityIndicator color={colors.background} /> : <Text style={{ color: colors.background }}>{makeLabel(maker)}</Text>}
      </TouchableOpacity>
      <View style={styles.links}>
        {music && <TouchableOpacity onPress={onSurprise} disabled={busy} testID="music-surprise"><Text style={{ color: colors.primary }}>Surprise me</Text></TouchableOpacity>}
        <TouchableOpacity onPress={onImport} disabled={busy} testID="music-import-midi" accessibilityLabel="Import a MIDI file"><Text style={{ color: colors.primary }}>Import MIDI</Text></TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: SPACING.md, padding: SPACING.lg, gap: SPACING.md },
  label: { ...TYPOGRAPHY.body },
  hint: { ...TYPOGRAPHY.bodySmall },
  input: { ...TYPOGRAPHY.body, minHeight: 72, borderWidth: 1, borderRadius: SPACING.sm, padding: SPACING.md, textAlignVertical: 'top' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  half: { flexBasis: '48%', flexGrow: 1 },
  make: { borderRadius: SPACING.sm, paddingVertical: SPACING.md, alignItems: 'center' },
  links: { flexDirection: 'row', gap: SPACING.xl },
  busy: { opacity: 0.6 },
});
