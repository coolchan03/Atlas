import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { SPACING, TYPOGRAPHY } from '../constants';
import { ScreenHeader } from '../components/ScreenHeader';
import { Button } from '../components/Button';
import { useWideLayout } from '../hooks/useWideLayout';
import { usePressureLog } from '../atlasTools/pressureLog';
import { LEVEL_NAME, stormRisk, type StormLevel } from './risk';
import { narrateStorm } from './narrate';
import { useBarometer } from './useBarometer';

const hpaText = (n: number | null) => (n === null ? 'not enough readings yet' : `${n >= 0 ? '+' : ''}${n.toFixed(1)} hPa`);

/** Is the weather turning? The level comes from how fast the pressure is falling (decided in code); the phone's AI explains it in plain words. */
export const StormWatchScreen: React.FC = () => {
  const { colors } = useTheme();
  const wide = useWideLayout(760);
  const { samples, clear } = usePressureLog();
  const { hpa, state } = useBarometer();
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(t); }, []);
  const risk = React.useMemo(() => stormRisk(samples, now), [samples, now]);
  const [words, setWords] = React.useState<{ level: StormLevel; text: string; fromAi: boolean } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const explain = async () => {
    setBusy(true);
    try { const r = await narrateStorm(risk); setWords({ level: risk.level, ...r }); } finally { setBusy(false); }
  };
  const hot = risk.level === 'warning' || risk.level === 'storm';
  const tone = hot ? colors.error : colors.primary;
  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]} edges={['top']}>
      <ScreenHeader title="Storm watch" />
      <ScrollView contentContainerStyle={[styles.body, wide.column]}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: tone }]}>
          <Text style={{ color: tone, ...TYPOGRAPHY.h2 }} testID="storm-level">{LEVEL_NAME[risk.level]}</Text>
          <Text style={{ color: colors.text, ...TYPOGRAPHY.body }} testID="storm-advice">{risk.advice}</Text>
        </View>
        <Text style={{ color: colors.textSecondary, ...TYPOGRAPHY.meta }}>PRESSURE</Text>
        <Text style={{ color: colors.text, ...TYPOGRAPHY.body }} testID="storm-numbers">
          {`Now: ${hpa !== null ? `${hpa.toFixed(1)} hPa` : state === 'unavailable' ? 'this phone has no barometer' : 'reading...'}\nLast 3 hours: ${hpaText(risk.change3h)}\nLast hour: ${hpaText(risk.change1h)}`}
        </Text>
        <Button title={busy ? 'Writing...' : 'Explain in plain words'} variant="outline" onPress={() => { void explain(); }} disabled={busy || risk.level === 'learning'} testID="storm-explain" />
        {!!words && words.level === risk.level && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={{ color: colors.text, ...TYPOGRAPHY.body }} testID="storm-words">{words.text}</Text>
            <Text style={{ color: colors.textMuted, ...TYPOGRAPHY.meta }}>{words.fromAi ? 'WORDED BY THE AI. THE LEVEL IS WORKED OUT FROM THE NUMBERS.' : 'FIXED ADVICE FOR THIS LEVEL'}</Text>
          </View>
        )}
        <Text style={{ color: colors.textMuted, ...TYPOGRAPHY.bodySmall }} testID="storm-note">
          Atlas reads the barometer only while this screen or the Sensors screen is open, and keeps one reading every ten minutes for three days, on this phone. It does not read pressure in the background, so leave the phone running here (or open this screen now and then) for the level to follow the weather. A guide, not a forecast.
        </Text>
        {samples.length > 0 && <Button title="Clear the readings" variant="outline" onPress={clear} testID="storm-clear" />}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: { padding: SPACING.lg, gap: SPACING.md },
  card: { borderWidth: 1, borderRadius: SPACING.md, padding: SPACING.md, gap: SPACING.xs },
});
