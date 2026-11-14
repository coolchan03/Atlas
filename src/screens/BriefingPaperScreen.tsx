import React, { useEffect, useState } from 'react';
import { Linking, ScrollView, Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../theme';
import { useStudyStore } from '../study/engine';
import { BRIEF_PROJECT } from '../atlasTools/dailyBrief';
import type { WeatherData } from '../atlasTools/weather';
import { useMaps } from '../atlasMaps/maps';
import type { RootStackParamList } from '../navigation/types';
import { uvAdvice } from '../atlasTools/weather';
import { fmtTemp, useUnits } from '../atlasTools/units';
import { TYPOGRAPHY } from '../constants';

type Route = RouteProp<RootStackParamList, 'BriefingPaper'>;

/** Groups podcast lines into story sections using storyStarts indices. */
function extractStories(podcast: { host: string; text: string }[], storyStarts: number[]): string[] {
  if (!podcast.length) return [];
  const starts = [...storyStarts].sort((a, b) => a - b);
  if (!starts.length) return [podcast.map((l) => l.text).join(' ')];
  const sections: string[] = [];
  for (let i = 0; i < starts.length; i++) {
    const from = starts[i];
    const to = starts[i + 1] ?? podcast.length;
    sections.push(podcast.slice(from, to).map((l) => l.text).join(' '));
  }
  return sections;
}

function WeatherBand({ weather }: { weather: WeatherData }) {
  const { colors } = useTheme();
  const units = useUnits();
  return (
    <View style={[staticStyles.h1, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
      <View style={staticStyles.h2}>
        <Icon name="cloud" size={14} color={colors.textSecondary} />
        <Text style={{ ...TYPOGRAPHY.meta, color: colors.text }}>{weather.description}</Text>
      </View>
      <View style={staticStyles.h3}>
        <Icon name="thermometer" size={14} color={colors.textSecondary} />
        <Text style={{ ...TYPOGRAPHY.meta, color: colors.text }}>{fmtTemp(weather.tempMaxC, units.temp)} / {fmtTemp(weather.tempMinC, units.temp)}</Text>
      </View>
      <View style={staticStyles.h4}>
        <Icon name="sun" size={14} color={colors.textSecondary} />
        <Text style={{ ...TYPOGRAPHY.meta, color: colors.text }}>UV {weather.uvMax}: {uvAdvice(weather.uvMax)}</Text>
      </View>
      {weather.precipProbPct > 10 && (
        <View style={staticStyles.h5}>
          <Icon name="droplet" size={14} color={colors.textSecondary} />
          <Text style={{ ...TYPOGRAPHY.meta, color: colors.text }}>{weather.precipProbPct}% chance of rain</Text>
        </View>
      )}
    </View>
  );
}

export const BriefingPaperScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { params } = useRoute<Route>();
  const { colors } = useTheme();
  const briefing = useStudyStore((s) =>
    (s.saved[BRIEF_PROJECT] ?? []).find((r) => r.createdAt === params.createdAt),
  );
  const fix = useMaps((s) => s.lastFix);
  const [weather, setWeather] = useState<WeatherData | null>(null);

  useEffect(() => {
    if (!fix) return;
    const { fetchWeather } = require('../atlasTools/weather');
    fetchWeather(fix.lat, fix.lon).then((w: WeatherData | null) => setWeather(w)).catch(() => undefined);
  }, [fix?.lat, fix?.lon]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!briefing) {
    return (
      <SafeAreaView style={[staticStyles.h6, { backgroundColor: colors.background }]} edges={['top']}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={staticStyles.h7}>
          <Icon name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[staticStyles.h8, { ...TYPOGRAPHY.body, color: colors.textSecondary }]}>Briefing not found.</Text>
      </SafeAreaView>
    );
  }

  const podcast = briefing.podcast ?? [];
  const storyStarts = briefing.storyStarts ?? [];
  const headlines = briefing.headlines ?? [];
  const stories = extractStories(podcast, storyStarts);
  const dateLine = new Date(briefing.createdAt).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).toUpperCase();
  const greeting = storyStarts.length > 0 && podcast[0] ? podcast[0].text : '';

  return (
    <SafeAreaView style={[staticStyles.h9, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[staticStyles.h10, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={staticStyles.h11}>
          <Icon name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[staticStyles.h12, { ...TYPOGRAPHY.h3, color: colors.text }]}>Read</Text>
      </View>

      {weather && <WeatherBand weather={weather} />}

      <ScrollView contentContainerStyle={staticStyles.h26}>
        {/* Masthead */}
        <View style={[staticStyles.h13, { borderBottomColor: colors.text }]}>
          <Text style={[staticStyles.h14, { ...TYPOGRAPHY.meta, color: colors.textSecondary }]}>{dateLine}</Text>
          <Text style={[staticStyles.h15, { ...TYPOGRAPHY.h1, color: colors.text }]}>ATLAS BRIEFING</Text>
          <Text style={[staticStyles.h16, { ...TYPOGRAPHY.meta, color: colors.textSecondary }]}>
            {briefing.minutes ? `${briefing.minutes} min read` : ''}{briefing.minutes && headlines.length ? ' · ' : ''}{headlines.length ? `${headlines.length} stories` : ''}
          </Text>
        </View>

        {/* Opening line */}
        {!!greeting && (
          <View style={[staticStyles.h17, { borderBottomColor: colors.border }]}>
            <Text style={[staticStyles.h18, { ...TYPOGRAPHY.body, color: colors.textSecondary }]}>{greeting}</Text>
          </View>
        )}

        {/* Stories */}
        {stories.map((storyText, i) => {
          const hl = headlines[i];
          return (
            <View key={i} style={[staticStyles.h19, { borderBottomColor: colors.border }]}>
              {/* Headline */}
              {hl ? (
                <TouchableOpacity onPress={() => hl.url && Linking.openURL(hl.url)} disabled={!hl.url}>
                  <Text style={[staticStyles.h20, { ...TYPOGRAPHY.h3, color: colors.text }]}>{hl.title}</Text>
                  <Text style={[staticStyles.h21, { ...TYPOGRAPHY.meta, color: colors.textMuted }]}>
                    {[hl.source, hl.interest, hl.date && new Date(hl.date).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })].filter(Boolean).join(' · ')}
                    {hl.url ? '  (tap to read)' : ''}
                  </Text>
                </TouchableOpacity>
              ) : (
                <View style={[staticStyles.h22, { backgroundColor: colors.border }]} />
              )}
              {/* Body */}
              <Text style={[staticStyles.h23, { ...TYPOGRAPHY.body, color: colors.text }]}>{storyText}</Text>
            </View>
          );
        })}

        {/* No headlines fallback: show full script */}
        {stories.length === 0 && podcast.length > 0 && (
          <View style={staticStyles.h24}>
            <Text style={[staticStyles.h25, { ...TYPOGRAPHY.body, color: colors.text }]}>
              {podcast.map((l) => l.text).join(' ')}
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const staticStyles = StyleSheet.create({
  h1: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingVertical: 10, paddingHorizontal: 16, borderBottomWidth: 1 },
  h2: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  h3: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  h4: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  h5: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  h6: { flex: 1 },
  h7: { padding: 16 },
  h8: { padding: 24 },
  h9: { flex: 1 },
  h10: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  h11: { marginRight: 12 },
  h12: { flex: 1 },
  h13: { padding: 16, borderBottomWidth: 2, alignItems: 'center' },
  h14: { letterSpacing: 1 },
  h15: { textAlign: 'center', marginTop: 4, letterSpacing: 2 },
  h16: { marginTop: 2 },
  h17: { padding: 16, borderBottomWidth: 1 },
  h18: { fontStyle: 'italic' },
  h19: { padding: 16, borderBottomWidth: 1 },
  h20: { lineHeight: 24, marginBottom: 4 },
  h21: { marginBottom: 8 },
  h22: { height: 1, marginBottom: 12 },
  h23: { lineHeight: 22 },
  h24: { padding: 16 },
  h25: { lineHeight: 22 },
  h26: { paddingBottom: 60 },
});
