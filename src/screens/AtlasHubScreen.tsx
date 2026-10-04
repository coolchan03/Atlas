import React, { useEffect, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../theme';
import { useEmergencyColors, useOffGrid } from '../atlasTools/offGrid';
import { OffGridCard } from '../components/OffGridCard';
import { deviceHasCompass } from './CompassScreen';
import { useAgentStore } from '../stores/agentStore';
import { installAtlasStarter } from '../learning/starter';

/** Atlas: everything for emergencies, travel and life off the grid, in one place. */
export const AtlasHubScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { colors: base } = useTheme();
  const colors = useEmergencyColors(base);
  const night = useOffGrid((s) => s.nightRed);
  const { width } = useWindowDimensions();
  const cols = width >= 900 ? 4 : width >= 600 ? 3 : 2;
  const [hasCompass, setHasCompass] = useState(false);
  useEffect(() => { deviceHasCompass().then(setHasCompass); }, []);
  const activeAgentId = useAgentStore((s) => s.activeAgentId);
  const setActiveAgent = useAgentStore((s) => s.setActiveAgent);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const tiles = [
    { label: 'Emergency', sub: 'Bleeding, CPR, burns, water...', icon: 'alert-octagon', color: '#B91C1C', to: 'Emergency' },
    { label: 'Survival Manual', sub: 'Water, fire, shelter, food, plants', icon: 'book-open', color: '#3F6212', to: 'SurvivalManual' },
    { label: 'Maps', sub: 'Offline maps, GPS, saved places', icon: 'map', color: '#0F766E', to: 'Maps' },
    { label: 'Phrases', sub: 'Show or speak in 10+ languages', icon: 'globe', color: '#1D4ED8', to: 'Phrases' },
    ...(hasCompass ? [{ label: 'Compass', sub: 'Works with no signal', icon: 'compass', color: '#6D28D9', to: 'Compass' }] : []),
    { label: 'Offline Library', sub: 'Atlas packs, WikiMed, Wikipedia', icon: 'database', color: '#92400E', to: 'OfflineLibrary' },
    { label: 'Daily briefing', sub: 'Your news, read aloud, with fun facts', icon: 'radio', color: '#BE185D', to: 'DailyBrief' },
  ];

  const addCards = async () => {
    setBusy(true);
    try {
      const r = await installAtlasStarter(setMsg);
      setMsg(`Done: ${r.added} documents added${r.skipped ? `, ${r.skipped} already there` : ''}. Chats in the "Atlas - Emergency" project can quote them.`);
    } catch (e: any) { setMsg(`Could not add them: ${String(e?.message || e)}`); } finally { setBusy(false); }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12 }}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 6 }}><Icon name="arrow-left" size={22} color={colors.text} /></TouchableOpacity>
        <View style={{ marginLeft: 8, flex: 1 }}>
          <Text style={{ color: colors.text, fontSize: 24, fontWeight: '700', fontFamily: 'serif' }}>Atlas</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Emergencies, travel and off-grid life. All of it works offline.</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40, width: '100%', maxWidth: 1100, alignSelf: 'center' }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6 }}>
          {tiles.map((t) => (
            <View key={t.to} style={{ width: `${100 / cols}%`, padding: 6 }}>
              <TouchableOpacity onPress={() => navigation.navigate(t.to)} activeOpacity={0.8}
                style={{ backgroundColor: night ? '#1E0202' : t.color, borderWidth: night ? 1 : 0, borderColor: '#5A0E0E', borderRadius: 16, padding: 16, minHeight: 112, justifyContent: 'space-between' }}>
                <Icon name={t.icon} size={26} color={night ? '#FF3B3B' : '#fff'} />
                <View>
                  <Text style={{ color: night ? '#FF6B6B' : '#fff', fontSize: 18, fontWeight: '700', marginTop: 10 }}>{t.label}</Text>
                  <Text style={{ color: night ? '#C04040' : 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 2 }} numberOfLines={2}>{t.sub}</Text>
                </View>
              </TouchableOpacity>
            </View>
          ))}
        </View>

        <View style={{ marginTop: 12 }}><OffGridCard /></View>

        <TouchableOpacity onPress={() => { setActiveAgent('atlas'); navigation.navigate('Main', { screen: 'ChatsTab' }); }}
          style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginBottom: 10 }}>
          <Icon name="message-circle" size={20} color={colors.primary} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>Ask the Atlas agent{activeAgentId === 'atlas' ? ' (active)' : ''}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Makes Atlas the active agent and opens your chats.</Text>
          </View>
          <Icon name="chevron-right" size={18} color={colors.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity onPress={addCards} disabled={busy}
          style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 12, padding: 14 }}>
          <Icon name="download" size={20} color={colors.primary} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>{busy ? 'Adding...' : 'Give the AI the emergency cards'}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{msg ?? 'Creates the "Atlas - Emergency" project with all cards and the Survival Manual so answers can quote them. Takes a minute.'}</Text>
          </View>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};
