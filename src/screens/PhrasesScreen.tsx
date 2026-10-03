import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Feather';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../theme';
import { PHRASES_EN, PHRASE_LANGUAGES, Phrase } from '../phrases/data';
import { speakIn, stop, onMissingLanguage } from '../atlasVoice/tts';
import { ensureTextModel } from '../atlasTools/models';

const LAST_LANG = 'atlas-phrases-lang';

/** Travel phrase cards: show big to the other person, or play aloud in their language. Offline. */
export const PhrasesScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const [code, setCode] = useState(PHRASE_LANGUAGES[0].code);
  const [shown, setShown] = useState<{ text: string; roman?: string; en: string } | null>(null);
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const lang = PHRASE_LANGUAGES.find((l) => l.code === code)!;

  useEffect(() => {
    AsyncStorage.getItem(LAST_LANG).then((v) => { if (v && PHRASE_LANGUAGES.some((l) => l.code === v)) setCode(v); }).catch(() => undefined);
    onMissingLanguage(() => Alert.alert('Voice not installed', `Your phone has no ${lang.name} voice yet. Settings > Text-to-speech > install voice data for ${lang.name} (download it while you have internet).`));
    return () => { onMissingLanguage(null); stop(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pickLang = (c: string) => { setCode(c); AsyncStorage.setItem(LAST_LANG, c).catch(() => undefined); };

  const translate = async () => {
    if (!custom.trim()) return;
    setBusy(true);
    try {
      await ensureTextModel(null);
      const { llmService } = require('../services/llm');
      if (llmService.isCurrentlyGenerating()) throw new Error('The model is busy with a chat. Try again in a moment.');
      const out: string = await llmService.generateResponse([
        { id: 's', role: 'system', content: `You translate short phrases into ${lang.name}. Reply with ONLY the translation${/^(ja|zh|ar|hi|ru)/.test(code) ? ', then on a new line the pronunciation in Latin letters' : ''}. No explanations.`, timestamp: 0 },
        { id: 'u', role: 'user', content: custom.trim(), timestamp: 0 },
      ], { disableThinking: true });
      const lines = out.replace(/<think>[\s\S]*?<\/think>/g, '').trim().split('\n').map((l) => l.trim()).filter(Boolean);
      setShown({ text: lines[0] || '', roman: lines[1], en: `${custom.trim()} (translated by the AI - may contain mistakes)` });
    } catch (e: any) {
      Alert.alert('Could not translate', String(e?.message || e));
    } finally { setBusy(false); }
  };

  if (shown) {
    const big = Math.min(64, Math.max(30, width / 12));
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#111' }}>
        <TouchableOpacity style={{ flex: 1, justifyContent: 'center', padding: 24 }} activeOpacity={1} onPress={() => { stop(); setShown(null); }}>
          <Text style={{ color: '#fff', fontSize: big, fontWeight: '700', textAlign: 'center' }}>{shown.text}</Text>
          {!!shown.roman && <Text style={{ color: '#ccc', fontSize: big * 0.45, textAlign: 'center', marginTop: 16 }}>{shown.roman}</Text>}
          <Text style={{ color: '#888', fontSize: 16, textAlign: 'center', marginTop: 28 }}>{shown.en}</Text>
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', justifyContent: 'center', paddingBottom: 30, gap: 16 }}>
          <TouchableOpacity onPress={() => speakIn(shown.text, code)} style={{ backgroundColor: '#2563EB', borderRadius: 30, paddingHorizontal: 26, paddingVertical: 14, flexDirection: 'row', alignItems: 'center' }}>
            <Icon name="volume-2" size={22} color="#fff" /><Text style={{ color: '#fff', fontSize: 18, marginLeft: 8 }}>Play</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { stop(); setShown(null); }} style={{ backgroundColor: '#333', borderRadius: 30, paddingHorizontal: 26, paddingVertical: 14 }}>
            <Text style={{ color: '#fff', fontSize: 18 }}>Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#2563EB' }}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 6 }}><Icon name="arrow-left" size={22} color="#fff" /></TouchableOpacity>
        <Text style={{ color: '#fff', fontSize: 21, fontWeight: '800', marginLeft: 8 }}>Phrases</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ padding: 10 }}>
        {PHRASE_LANGUAGES.map((l) => (
          <TouchableOpacity key={l.code} onPress={() => pickLang(l.code)} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, marginRight: 8, backgroundColor: l.code === code ? '#2563EB' : colors.surface }}>
            <Text style={{ color: l.code === code ? '#fff' : colors.text }}>{l.name} · {l.native}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 120, width: '100%', maxWidth: 920, alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
        <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 10 }}>
          Tap a phrase to show it big to the other person; the speaker plays it in {lang.name} with your phone's voice. Translations were written by an AI - the meaning should be clear, but check important ones with a local when you can.
        </Text>
        <View style={{ backgroundColor: colors.surface, borderRadius: 10, padding: 12, marginBottom: 12 }}>
          <Text style={{ color: colors.text, fontWeight: '600', marginBottom: 6 }}>Translate anything (uses the loaded AI model, offline)</Text>
          <View style={{ flexDirection: 'row' }}>
            <TextInput value={custom} onChangeText={setCustom} onSubmitEditing={translate} placeholder="e.g. My friend is not breathing" placeholderTextColor={colors.textMuted}
              style={{ flex: 1, backgroundColor: colors.background, color: colors.text, borderRadius: 8, padding: 10 }} />
            <TouchableOpacity onPress={translate} disabled={busy} style={{ marginLeft: 8, backgroundColor: '#2563EB', borderRadius: 8, paddingHorizontal: 14, justifyContent: 'center' }}>
              {busy ? <ActivityIndicator color="#fff" /> : <Icon name="arrow-right" size={18} color="#fff" />}
            </TouchableOpacity>
          </View>
        </View>
        {lang.phrases.map((p: Phrase, i: number) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 10, marginBottom: 8 }}>
            <TouchableOpacity style={{ flex: 1, padding: 14 }} onPress={() => setShown({ text: p[0], roman: p[1], en: PHRASES_EN[i] })}>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>{PHRASES_EN[i]}</Text>
              <Text style={{ color: colors.text, fontSize: 20, fontWeight: '600', marginTop: 2 }}>{p[0]}</Text>
              {!!p[1] && <Text style={{ color: colors.textSecondary, fontSize: 14, marginTop: 2 }}>{p[1]}</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => speakIn(p[0], code)} style={{ padding: 16 }} accessibilityLabel="Play">
              <Icon name="volume-2" size={22} color="#2563EB" />
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
};
