import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { SPACING, TYPOGRAPHY } from '../constants';
import { SwipeRow, type RowAction } from '../components/SwipeRow';
import { STYLES, type StyleMood } from './styles';
import type { InstrumentalTrack } from './library';

/** The saved tunes. Tap plays; swipe sideways or press and hold for share, edit notes, variation, continue and delete. */
export function TrackList({ tracks, activeId, playingId, busy, onPlay, onShare, onEdit, onVariation, onContinue, onDelete }: {
  tracks: InstrumentalTrack[]; activeId?: string; playingId?: string; busy: boolean;
  onPlay: (t: InstrumentalTrack) => void; onShare: (t: InstrumentalTrack) => void; onEdit: (t: InstrumentalTrack) => void;
  onVariation: (t: InstrumentalTrack) => void; onContinue: (t: InstrumentalTrack) => void; onDelete: (t: InstrumentalTrack) => void;
}) {
  const { colors } = useTheme();
  if (!tracks.length) return <Text style={[styles.empty, { color: colors.textSecondary }]}>Make a track to build your offline playlist.</Text>;
  return (
    <View style={styles.list}>
      {tracks.map((t) => {
        const editable = !!t.scorePath && t.mood !== 'ambient';
        const actions: RowAction[] = [
          { id: 'share', label: 'Share', icon: 'share-2', onPress: () => onShare(t) },
          ...(editable ? [
            { id: 'edit', label: 'Edit notes', icon: 'edit-2', onPress: () => onEdit(t) },
            { id: 'variation', label: 'Variation', icon: 'shuffle', onPress: () => { if (!busy) onVariation(t); } },
            { id: 'continue', label: 'Continue', icon: 'fast-forward', onPress: () => { if (!busy) onContinue(t); } },
          ] : []),
          { id: 'delete', label: 'Delete', icon: 'trash-2', destructive: true, onPress: () => onDelete(t) },
        ];
        // Delete is the first button of the swipe (the most wanted); the rest are in the sheet that press-and-hold opens.
        const swipe = [actions[actions.length - 1], ...actions.slice(0, -1)];
        return (
          <SwipeRow key={t.id} title={t.title} actions={swipe} onPress={() => onPlay(t)} testID={`music-track-${t.id}`}>
            <View style={[styles.row, { backgroundColor: colors.surface, borderColor: activeId === t.id ? colors.primary : colors.border }]}>
              <View style={styles.text}>
                <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{t.title}</Text>
                <Text style={[styles.meta, { color: colors.textSecondary }]}>{STYLES[t.mood as StyleMood]?.label ?? t.mood} · {t.seconds}s{playingId === t.id ? ' · Playing' : ''}</Text>
              </View>
            </View>
          </SwipeRow>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: SPACING.sm },
  empty: { ...TYPOGRAPHY.body },
  row: { borderWidth: 1, borderRadius: SPACING.md, padding: SPACING.md, flexDirection: 'row', alignItems: 'center' },
  text: { flex: 1 },
  name: { ...TYPOGRAPHY.body },
  meta: { ...TYPOGRAPHY.bodySmall },
});
