/** The two grids of the score editor: a piano roll (pitch rows, step columns) and a drum grid. Presentation only: taps go to the screen. */
import { TYPOGRAPHY } from '../constants';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../theme';
import { DRUM_ROWS, GRID, barCount, noteAt, roleOf } from './editor';
import type { DrumKind, MusicRole, MusicScore } from './types';

const CELL = 30;
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const pitchName = (p: number): string => `${NAMES[p % 12]}${Math.floor(p / 12) - 1}`;
const STEPS_PER_BAR = 4 / GRID;
/** Bars shown: the tune's own, plus one empty bar to add to, up to eight. */
export const barsShown = (score: MusicScore): number => Math.min(8, barCount(score) + 1);

export function PianoRoll({ score, role, top, rows, onTap }: { score: MusicScore; role: MusicRole; top: number; rows: number; onTap: (pitch: number, beat: number) => void }) {
  const { colors } = useTheme();
  const steps = barsShown(score) * STEPS_PER_BAR;
  const pitches = Array.from({ length: rows }, (_, i) => top - i);
  return (
    <ScrollView horizontal testID="piano-roll">
      <View>
        {pitches.map((pitch) => (
          <View key={pitch} style={styles.row}>
            <Text style={[styles.label, { color: colors.textMuted }]}>{pitchName(pitch)}</Text>
            {Array.from({ length: steps }, (_, s) => {
              const beat = s * GRID;
              const on = noteAt(score, { role, pitch }, beat) >= 0;
              const barLine = s % STEPS_PER_BAR === 0;
              return (
                <TouchableOpacity key={s} testID={`cell-${pitch}-${s}`} accessibilityLabel={`${pitchName(pitch)} step ${s + 1}${on ? ' on' : ''}`} onPress={() => onTap(pitch, beat)}
                  style={[styles.cell, { borderColor: colors.border, backgroundColor: on ? colors.primary : barLine ? colors.surface : colors.background }, barLine ? styles.barLine : styles.stepLine]} />
              );
            })}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

export function DrumGrid({ score, onTap }: { score: MusicScore; onTap: (kind: DrumKind, beat: number) => void }) {
  const { colors } = useTheme();
  const steps = barsShown(score) * STEPS_PER_BAR;
  const hit = (kind: DrumKind, beat: number) => score.notes.some((n) => roleOf(n) === 'perc' && n.voice === kind && Math.abs(n.beat - beat) < 1e-6);
  return (
    <ScrollView horizontal testID="drum-grid">
      <View>
        {DRUM_ROWS.map(({ kind }) => (
          <View key={kind} style={styles.row}>
            <Text style={[styles.label, { color: colors.textMuted }]}>{kind}</Text>
            {Array.from({ length: steps }, (_, s) => {
              const beat = s * GRID; const on = hit(kind, beat); const barLine = s % STEPS_PER_BAR === 0;
              return (
                <TouchableOpacity key={s} testID={`drum-${kind}-${s}`} accessibilityLabel={`${kind} step ${s + 1}${on ? ' on' : ''}`} onPress={() => onTap(kind, beat)}
                  style={[styles.cell, { borderColor: colors.border, backgroundColor: on ? colors.primary : barLine ? colors.surface : colors.background }, barLine ? styles.barLine : styles.stepLine]} />
              );
            })}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  label: { width: 46, ...TYPOGRAPHY.meta },
  cell: { width: CELL, height: 24, borderWidth: 0.5 },
  barLine: { borderLeftWidth: 2 },
  stepLine: { borderLeftWidth: 0.5 },
});
