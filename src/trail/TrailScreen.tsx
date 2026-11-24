import React from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { SPACING, TYPOGRAPHY } from '../constants';
import { ScreenHeader } from '../components/ScreenHeader';
import { Button } from '../components/Button';
import { useWideLayout } from '../hooks/useWideLayout';
import { compassName, fmtDistance, useMaps, watchPosition } from '../atlasMaps/maps';
import { dayKey, useJournal } from '../journal/store';
import { backStep, trailStats, type BackStep } from './geometry';
import { trailPage } from './page';
import { useTrails, type Trail } from './store';

const clock = (ms: number) => { const m = Math.round(ms / 60_000); return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`; };

/** Record a walk with the GPS, lead the way back along it, and turn it into a journal page. Recording runs only while this screen is open. */
export const TrailScreen: React.FC = () => {
  const { colors } = useTheme();
  const wide = useWideLayout(760);
  const { trails, activeId, start, stop, remove, setPage, fix } = useTrails();
  const imperial = useMaps((s) => s.imperial);
  const here = useMaps((s) => s.lastFix);
  const [name, setName] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [leading, setLeading] = React.useState<string | null>(null);
  const [notes, setNotes] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState('');

  // The GPS runs while this screen is open; each position goes to the trail being recorded.
  React.useEffect(() => {
    let alive = true; let stopGps: (() => void) | undefined;
    watchPosition((f) => { if (alive) useTrails.getState().fix(f); }, (m) => alive && setMessage(m)).then((s) => { if (alive) stopGps = s; else s(); }).catch(() => undefined);
    return () => { alive = false; stopGps?.(); };
  }, [fix]);

  const dist = (m: number) => fmtDistance(m, imperial);
  const active = trails.find((t) => t.id === activeId);
  const stats = active ? trailStats(active.points) : null;
  const way: BackStep | null = (() => { const t = trails.find((x) => x.id === leading); return t && here ? backStep(t.points, here) : null; })();

  const writePage = async (t: Trail) => {
    setBusy(t.id); setSaved('');
    try {
      const page = await trailPage(t.name, trailStats(t.points), { note: notes[t.id] ?? '', imperial });
      setPage(t.id, page);
    } catch (e) { setSaved(`Could not write it: ${String((e as Error)?.message || e).slice(0, 120)}`); }
    setBusy(null);
  };
  const toJournal = (t: Trail) => {
    const day = dayKey(new Date(t.endedAt ?? t.startedAt));
    const existing = useJournal.getState().entries.find((e) => e.day === day);
    useJournal.getState().save(day, `${existing?.text ? `${existing.text}\n\n` : ''}${t.page}`, existing?.mood ?? null);
    setSaved(`Added to your journal page for ${day}.`);
  };

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]} edges={['top']}>
      <ScreenHeader title="Trail" />
      <ScrollView contentContainerStyle={[styles.body, wide.column]} keyboardShouldPersistTaps="handled">
        <Text style={{ color: colors.textSecondary, ...TYPOGRAPHY.bodySmall }}>
          Record a walk with the phone&apos;s GPS, follow it back to where you started, and write a journal page from it. It records while this screen is open, so keep it open on the walk. It works with no signal.
        </Text>
        {!!message && <Text style={{ color: colors.error, ...TYPOGRAPHY.bodySmall }} testID="trail-gps-message">{message}</Text>}
        {!active ? (
          <View style={styles.row}>
            <TextInput value={name} onChangeText={setName} placeholder="Name this walk (optional)" placeholderTextColor={colors.textMuted} testID="trail-name"
              style={[styles.line, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]} />
            <Button title="Start recording" onPress={() => { start(name); setName(''); }} testID="trail-start" />
          </View>
        ) : (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.primary }]}>
            <Text style={{ color: colors.primary, ...TYPOGRAPHY.h3 }}>{`Recording: ${active.name}`}</Text>
            <Text style={{ color: colors.text, ...TYPOGRAPHY.body }} testID="trail-live">{`${dist(stats!.distanceM)}  ·  ${clock(Date.now() - active.startedAt)}  ·  ${active.points.length} points`}</Text>
            <Button title="Stop" onPress={() => stop()} testID="trail-stop" />
          </View>
        )}
        {way && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.primary }]} testID="trail-way">
            {way.arrived ? <Text style={{ color: colors.text, ...TYPOGRAPHY.body }} testID="trail-arrived">You are back at the start.</Text> : (
              <>
                <Text style={{ color: colors.text, ...TYPOGRAPHY.h3 }} testID="trail-heading">{`Head ${compassName(way.bearing)} (${Math.round(way.bearing)}°) for ${dist(way.toNextM)}`}</Text>
                <Text style={{ color: colors.textSecondary, ...TYPOGRAPHY.bodySmall }}>{`${dist(way.remainingM)} left along your route back.`}</Text>
                {way.offRouteM > 60 && <Text style={{ color: colors.error, ...TYPOGRAPHY.bodySmall }} testID="trail-off-route">{`You are ${dist(way.offRouteM)} from your recorded route. Head for it first.`}</Text>}
              </>
            )}
          </View>
        )}
        {leading && !here && <Text style={{ color: colors.textMuted, ...TYPOGRAPHY.bodySmall }}>Waiting for a GPS position...</Text>}
        {trails.length > 0 && <Text style={{ color: colors.textSecondary, ...TYPOGRAPHY.meta }}>YOUR WALKS</Text>}
        {trails.filter((t) => t.id !== activeId).map((t) => {
          const s = trailStats(t.points);
          return (
            <View key={t.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]} testID={`trail-${t.id}`}>
              <Text style={{ color: colors.text, ...TYPOGRAPHY.h3 }}>{t.name}</Text>
              <Text style={{ color: colors.textSecondary, ...TYPOGRAPHY.bodySmall }}>{`${dist(s.distanceM)}  ·  ${clock(s.durationMs)}  ·  climbed ${dist(s.climbM)}`}</Text>
              <View style={styles.row}>
                <Button title={leading === t.id ? 'Stop leading' : 'Lead me back'} variant="outline" size="small" disabled={t.points.length < 2} onPress={() => setLeading(leading === t.id ? null : t.id)} testID={`trail-back-${t.id}`} />
                <Button title="Delete" variant="outline" size="small" onPress={() => { if (leading === t.id) setLeading(null); remove(t.id); }} testID={`trail-delete-${t.id}`} />
              </View>
              {t.page ? (
                <>
                  <Text selectable style={{ color: colors.text, ...TYPOGRAPHY.body }} testID={`trail-page-${t.id}`}>{t.page}</Text>
                  <Button title="Add to my journal" variant="outline" size="small" onPress={() => toJournal(t)} testID={`trail-journal-${t.id}`} />
                </>
              ) : (
                <>
                  <TextInput value={notes[t.id] ?? ''} onChangeText={(v) => setNotes((n) => ({ ...n, [t.id]: v }))} placeholder="How was it? (optional)" placeholderTextColor={colors.textMuted} testID={`trail-note-${t.id}`}
                    style={[styles.line, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]} />
                  <Button title={busy === t.id ? 'Writing...' : 'Write a journal page'} variant="outline" size="small" disabled={busy === t.id || t.points.length < 2} onPress={() => { void writePage(t); }} testID={`trail-write-${t.id}`} />
                </>
              )}
            </View>
          );
        })}
        {!!saved && <Text style={{ color: colors.textMuted, ...TYPOGRAPHY.bodySmall }} testID="trail-saved">{saved}</Text>}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: { padding: SPACING.lg, gap: SPACING.md },
  row: { flexDirection: 'row', gap: SPACING.sm, flexWrap: 'wrap', alignItems: 'center' },
  line: { ...TYPOGRAPHY.body, borderWidth: 1, borderRadius: SPACING.sm, padding: SPACING.md, minWidth: 180 },
  card: { borderWidth: 1, borderRadius: SPACING.md, padding: SPACING.md, gap: SPACING.sm },
});
