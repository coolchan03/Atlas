import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../theme';
import { useStudyStore } from '../study/engine';
import { BRIEF_PROJECT, makeBriefing, parseInterests, todayKey, useBriefPrefs } from '../atlasTools/dailyBrief';
import { listVoices, keepScreenOn } from '../atlasVoice/tts';

const EMPTY: never[] = [];

/** A short spoken news show about your interests, with fun facts. */
export const DailyBriefScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { colors } = useTheme();
  const prefs = useBriefPrefs();
  const list = useStudyStore((s) => s.saved[BRIEF_PROJECT]) || EMPTY;
  const remove = useStudyStore((s) => s.remove);
  const today = list.find((r) => todayKey(new Date(r.createdAt)) === todayKey());
  const [say, setSay] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [voices, setVoices] = useState(0);
  useEffect(() => { listVoices('en').then((v) => setVoices(v.length)).catch(() => undefined); }, []);

  const card = { backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginBottom: 10 };
  const chip = (on: boolean) => ({ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary : 'transparent', marginRight: 8, marginTop: 8 });
  const open = (at: number) => navigation.navigate('Study', { projectId: BRIEF_PROJECT, openAt: at });

  const addInterests = () => {
    const found = parseInterests(say);
    if (!found.length) return;
    const have = new Set(prefs.interests.map((x) => x.toLowerCase()));
    prefs.setInterests([...prefs.interests, ...found.filter((f) => !have.has(f.toLowerCase()))].slice(0, 12));
    setSay('');
  };

  const make = async () => {
    if (busy) return;
    setBusy('Starting...');
    keepScreenOn(true);
    try {
      const r = await makeBriefing((m) => setBusy(m), voices);
      open(r.createdAt);
    } catch (e: any) {
      Alert.alert('Could not make the briefing', String(e?.message || e));
    } finally { setBusy(null); keepScreenOn(false); }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12 }}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 6 }}><Icon name="arrow-left" size={22} color={colors.text} /></TouchableOpacity>
        <Text style={{ color: colors.text, fontSize: 22, fontWeight: '700', fontFamily: 'serif', marginLeft: 8, flex: 1 }}>Daily briefing</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 60, width: '100%', maxWidth: 900, alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
        <View style={card}>
          <Text style={{ color: colors.textSecondary }}>
            {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
          </Text>
          {today ? (
            <>
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 17, marginTop: 4 }}>{today.title}</Text>
              <TouchableOpacity onPress={() => open(today.createdAt)} style={{ marginTop: 12, backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 12, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }}>
                <Icon name="play" size={16} color="#fff" /><Text style={{ color: '#fff', fontWeight: '700', marginLeft: 8 }}>Listen to today's briefing</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={make} disabled={!!busy} style={{ marginTop: 10, alignItems: 'center' }}>
                <Text style={{ color: colors.primary }}>{busy ? busy : 'Make a fresh one'}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 17, marginTop: 4 }}>Today's news, read to you</Text>
              <Text style={{ color: colors.textSecondary, marginTop: 4 }}>The latest stories on your interests{prefs.funFacts ? ', with fun facts' : ''}. With no internet you get an offline edition from your library instead.</Text>
              <TouchableOpacity onPress={make} disabled={!!busy} style={{ marginTop: 12, backgroundColor: busy ? colors.border : colors.primary, borderRadius: 10, paddingVertical: 12, alignItems: 'center' }}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>Make today's briefing</Text>}
              </TouchableOpacity>
            </>
          )}
          {!!busy && <Text style={{ color: colors.textSecondary, marginTop: 8, textAlign: 'center' }}>{busy}{'\n'}This takes a few minutes on a phone - keep Atlas open.</Text>}
        </View>

        <View style={card}>
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16 }}>Your interests</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {prefs.interests.map((it) => (
              <TouchableOpacity key={it} onPress={() => prefs.setInterests(prefs.interests.filter((x) => x !== it))} style={[chip(false), { flexDirection: 'row', alignItems: 'center' }]}>
                <Text style={{ color: colors.text }}>{it}</Text><Icon name="x" size={13} color={colors.textMuted} style={{ marginLeft: 6 }} />
              </TouchableOpacity>
            ))}
            {!prefs.interests.length && <Text style={{ color: colors.textMuted, marginTop: 8 }}>None yet - add some below.</Text>}
          </View>
          <TextInput value={say} onChangeText={setSay} onSubmitEditing={addInterests} returnKeyType="done"
            placeholder="Tell me what you're into, e.g. space, the Chicago Bears and cooking"
            placeholderTextColor={colors.textMuted} multiline blurOnSubmit
            style={{ backgroundColor: colors.background, color: colors.text, borderRadius: 10, padding: 12, marginTop: 12, minHeight: 48 }} />
          <TouchableOpacity onPress={addInterests} disabled={!say.trim()} style={{ alignSelf: 'flex-end', marginTop: 8, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: say.trim() ? colors.primary : colors.border }}>
            <Text style={{ color: '#fff', fontWeight: '600' }}>Add</Text>
          </TouchableOpacity>
          <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 6 }}>Tip: tap the microphone on your keyboard to say them. Tap an interest to remove it. Your interests are sent as search words to Bing News / Google News; everything else stays on the phone.</Text>
        </View>

        <View style={card}>
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16 }}>Show options</Text>
          <Text style={{ color: colors.textSecondary, marginTop: 8 }}>Length</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {[3, 5, 10, 15].map((m) => (
              <TouchableOpacity key={m} onPress={() => prefs.set({ minutes: m })} style={chip(prefs.minutes === m)}>
                <Text style={{ color: prefs.minutes === m ? '#fff' : colors.text }}>{m} min</Text>
              </TouchableOpacity>
            ))}
          </View>
          {voices >= 2 && (
            <>
              <Text style={{ color: colors.textSecondary, marginTop: 10 }}>Hosts</Text>
              <View style={{ flexDirection: 'row' }}>
                {([1, 2] as const).map((h) => (
                  <TouchableOpacity key={h} onPress={() => prefs.set({ hosts: h })} style={chip(prefs.hosts === h)}>
                    <Text style={{ color: prefs.hosts === h ? '#fff' : colors.text }}>{h === 1 ? 'One narrator' : 'Two hosts'}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
            <Text style={{ color: colors.text, flex: 1 }}>Fun facts</Text>
            <Switch value={prefs.funFacts} onValueChange={(v) => prefs.set({ funFacts: v })} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
            <Text style={{ color: colors.text, flex: 1 }}>Read the full top story for each interest (more detail, slower)</Text>
            <Switch value={prefs.deep} onValueChange={(v) => prefs.set({ deep: v })} />
          </View>
        </View>

        {list.length > 0 && <Text style={{ color: colors.textSecondary, fontWeight: '700', marginTop: 8, marginBottom: 6 }}>EARLIER BRIEFINGS</Text>}
        {list.map((r) => (
          <TouchableOpacity key={r.createdAt} onPress={() => open(r.createdAt)} style={[card, { flexDirection: 'row', alignItems: 'center' }]}>
            <Icon name="radio" size={18} color={colors.primary} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={{ color: colors.text, fontWeight: '600' }}>{r.title}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>{new Date(r.createdAt).toLocaleString()}</Text>
            </View>
            <TouchableOpacity onPress={() => remove(BRIEF_PROJECT, r.createdAt)} style={{ padding: 6 }}><Icon name="trash-2" size={16} color={colors.textMuted} /></TouchableOpacity>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
};
