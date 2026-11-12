/* eslint-disable react-native/no-inline-styles */
import React, { useEffect, useState } from 'react';
import { Linking, ScrollView, Text, TouchableOpacity, View } from 'react-native';
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
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingVertical: 10, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        <Icon name="cloud" size={14} color={colors.textSecondary} />
        <Text style={{ ...TYPOGRAPHY.meta, color: colors.text }}>{weather.description}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        <Icon name="thermometer" size={14} color={colors.textSecondary} />
        <Text style={{ ...TYPOGRAPHY.meta, color: colors.text }}>{fmtTemp(weather.tempMaxC, units.temp)} / {fmtTemp(weather.tempMinC, units.temp)}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        <Icon name="sun" size={14} color={colors.textSecondary} />
        <Text style={{ ...TYPOGRAPHY.meta, color: colors.text }}>UV {weather.uvMax} — {uvAdvice(weather.uvMax)}</Text>
      </View>
      {weather.precipProbPct > 10 && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
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
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 16 }}>
          <Icon name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={{ ...TYPOGRAPHY.body, color: colors.textSecondary, padding: 24 }}>Briefing not found.</Text>
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
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: 12 }}>
          <Icon name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={{ ...TYPOGRAPHY.h3, color: colors.text, flex: 1 }}>Read</Text>
      </View>

      {weather && <WeatherBand weather={weather} />}

      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        {/* Masthead */}
        <View style={{ padding: 16, borderBottomWidth: 2, borderBottomColor: colors.text, alignItems: 'center' }}>
          <Text style={{ ...TYPOGRAPHY.meta, color: colors.textSecondary, letterSpacing: 1 }}>{dateLine}</Text>
          <Text style={{ ...TYPOGRAPHY.h1, color: colors.text, textAlign: 'center', marginTop: 4, letterSpacing: 2 }}>ATLAS BRIEFING</Text>
          <Text style={{ ...TYPOGRAPHY.meta, color: colors.textSecondary, marginTop: 2 }}>
            {briefing.minutes ? `${briefing.minutes} min read` : ''}{briefing.minutes && headlines.length ? ' · ' : ''}{headlines.length ? `${headlines.length} stories` : ''}
          </Text>
        </View>

        {/* Opening line */}
        {!!greeting && (
          <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text style={{ ...TYPOGRAPHY.body, color: colors.textSecondary, fontStyle: 'italic' }}>{greeting}</Text>
          </View>
        )}

        {/* Stories */}
        {stories.map((storyText, i) => {
          const hl = headlines[i];
          return (
            <View key={i} style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              {/* Headline */}
              {hl ? (
                <TouchableOpacity onPress={() => hl.url && Linking.openURL(hl.url)} disabled={!hl.url}>
                  <Text style={{ ...TYPOGRAPHY.h3, color: colors.text, lineHeight: 24, marginBottom: 4 }}>{hl.title}</Text>
                  <Text style={{ ...TYPOGRAPHY.meta, color: colors.textMuted, marginBottom: 8 }}>
                    {[hl.source, hl.interest, hl.date && new Date(hl.date).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })].filter(Boolean).join(' · ')}
                    {hl.url ? '  (tap to read)' : ''}
                  </Text>
                </TouchableOpacity>
              ) : (
                <View style={{ height: 1, backgroundColor: colors.border, marginBottom: 12 }} />
              )}
              {/* Body */}
              <Text style={{ ...TYPOGRAPHY.body, color: colors.text, lineHeight: 22 }}>{storyText}</Text>
            </View>
          );
        })}

        {/* No headlines fallback: show full script */}
        {stories.length === 0 && podcast.length > 0 && (
          <View style={{ padding: 16 }}>
            <Text style={{ ...TYPOGRAPHY.body, color: colors.text, lineHeight: 22 }}>
              {podcast.map((l) => l.text).join(' ')}
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};
