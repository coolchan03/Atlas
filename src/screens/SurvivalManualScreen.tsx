import React, { useMemo, useRef, useState } from 'react';
import { BackHandler, Image, Linking, ScrollView, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Feather';
import Markdown from '@ronradtke/react-native-markdown-display';
import { useTheme } from '../theme';
import { SURVIVAL_CHAPTERS, SurvivalChapter } from '../survival/content';
import { SURVIVAL_IMAGES } from '../survival/images';
import { speak, stop } from '../atlasVoice/tts';
import { useAtlasVoiceStore } from '../atlasVoice/store';
import { prepareMessageForSpeech } from '../utils/messageContent';

const ICONS: Record<string, string> = {
  Introduction: 'info', Psychology: 'smile', Power: 'battery-charging', Planning: 'clipboard', Kits: 'briefcase', Apps: 'smartphone',
  Medicine: 'plus-square', Shelter: 'home', Water: 'droplet', Fire: 'zap', Food: 'coffee', Plants: 'feather', Animals: 'eye',
  Tools: 'tool', CarRepair: 'truck', BasicMechanicalSkills: 'settings', BlackoutDriving: 'moon', Desert: 'sun', Tropical: 'cloud-rain',
  Cold: 'cloud-snow', Sea: 'anchor', WaterCrossing: 'navigation', DirectionFinding: 'compass', Signaling: 'radio', RopesAndKnots: 'link',
  DangerousArthropods: 'alert-triangle', 'Poisonous-Plants': 'alert-octagon', FishAndMollusks: 'anchor', ManMadeHazards: 'alert-circle',
};

function ManualImage({ src, alt, width }: { src: string; alt: string; width: number }) {
  const mod = SURVIVAL_IMAGES[src];
  if (!mod) return null;
  const meta = Image.resolveAssetSource(mod);
  const w = Math.min(width, meta?.width ? meta.width * 1.6 : width);
  const h = meta?.width ? (w * meta.height) / meta.width : w * 0.6;
  return (
    <View style={{ alignItems: 'center', marginVertical: 10 }}>
      <Image source={mod} style={{ width: w, height: h, backgroundColor: '#fff', borderRadius: 6 }} resizeMode="contain" accessibilityLabel={alt} />
      {!!alt && <Text style={{ fontSize: 12, color: '#888', marginTop: 4, textAlign: 'center' }}>{alt}</Text>}
    </View>
  );
}

/** The Survival Manual (ligi/SurvivalManual, based on US Army FM 21-76), fully offline with pictures. */
export const SurvivalManualScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const [chapter, setChapter] = useState<SurvivalChapter | null>(null);
  const [q, setQ] = useState('');
  const [size, setSize] = useState(width >= 720 ? 18 : 16);
  const scrollRef = useRef<ScrollView>(null);
  const speaking = useAtlasVoiceStore((s) => s.speakingKey !== null && s.speakingMessageId === 'survival-chapter');
  const colW = Math.min(width, 920) - 36;
  const cols = width >= 1000 ? 3 : width >= 600 ? 2 : 1;

  useFocusEffect(React.useCallback(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (chapter) { stop(); setChapter(null); return true; }
      return false;
    });
    return () => sub.remove();
  }, [chapter]));

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return SURVIVAL_CHAPTERS.map((c) => ({ c, count: 0 }));
    return SURVIVAL_CHAPTERS
      .map((c) => ({ c, count: (c.md.toLowerCase().match(new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length + (c.title.toLowerCase().includes(s) ? 50 : 0) }))
      .filter((x) => x.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [q]);

  const openChapter = (id: string) => {
    const c = SURVIVAL_CHAPTERS.find((x) => x.id === id);
    if (c) { stop(); setChapter(c); scrollRef.current?.scrollTo({ y: 0, animated: false }); }
  };

  const mdStyles = useMemo(() => ({
    body: { color: colors.text, fontSize: size, lineHeight: size * 1.5 },
    heading1: { color: colors.text, fontSize: size + 8, fontWeight: '700' as const, marginTop: 16, marginBottom: 8 },
    heading2: { color: colors.text, fontSize: size + 6, fontWeight: '700' as const, marginTop: 16, marginBottom: 8 },
    heading3: { color: colors.primary, fontSize: size + 3, fontWeight: '700' as const, marginTop: 18, marginBottom: 6 },
    heading4: { color: colors.text, fontSize: size + 1, fontWeight: '700' as const, marginTop: 12 },
    blockquote: { backgroundColor: colors.surface, borderLeftColor: colors.primary, borderLeftWidth: 4, paddingHorizontal: 12, paddingVertical: 6 },
    link: { color: colors.primary, textDecorationLine: 'underline' as const },
    table: { borderColor: colors.border },
    tr: { borderColor: colors.border },
    code_inline: { backgroundColor: colors.surface, color: colors.text },
    bullet_list_icon: { color: colors.textSecondary },
    ordered_list_icon: { color: colors.textSecondary },
  }), [colors, size]);

  const rules = useMemo(() => ({
    image: (node: any) => <ManualImage key={node.key} src={node.attributes?.src || ''} alt={node.attributes?.alt || node.content || ''} width={colW} />,
  }), [colW]);

  const onLink = (url: string) => {
    const id = url.replace(/^\.?\//, '').replace(/\.md$/, '').split('#')[0];
    if (SURVIVAL_CHAPTERS.some((c) => c.id === id)) { openChapter(id); return false; }
    if (/^https?:/.test(url)) Linking.openURL(url).catch(() => undefined);
    return false;
  };

  if (chapter) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#3F6212' }}>
          <TouchableOpacity onPress={() => { stop(); setChapter(null); }} style={{ padding: 6 }}><Icon name="arrow-left" size={22} color="#fff" /></TouchableOpacity>
          <Text style={{ color: '#fff', fontSize: 19, fontWeight: '700', flex: 1, marginLeft: 8 }} numberOfLines={1}>{chapter.title}</Text>
          <TouchableOpacity onPress={() => (speaking ? stop() : speak(prepareMessageForSpeech(chapter.md.replace(/!\[[^\]]*\]\([^)]*\)/g, '')), 'survival-chapter'))} style={{ padding: 8 }}>
            <Icon name={speaking ? 'volume-x' : 'volume-2'} size={20} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setSize((s) => Math.max(13, s - 2))} style={{ padding: 8 }}><Text style={{ color: '#fff' }}>A-</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => setSize((s) => Math.min(28, s + 2))} style={{ padding: 8 }}><Text style={{ color: '#fff', fontSize: 18 }}>A+</Text></TouchableOpacity>
        </View>
        <ScrollView ref={scrollRef} contentContainerStyle={{ padding: 18, paddingBottom: 120, width: '100%', maxWidth: 920, alignSelf: 'center' }}>
          <Markdown style={mdStyles} rules={rules} onLinkPress={onLink}>{chapter.md}</Markdown>
          <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 24 }}>
            From the Survival Manual (github.com/ligi/SurvivalManual), based on US Army FM 21-76. Community edited; not medical advice.
          </Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#3F6212' }}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 6 }}><Icon name="arrow-left" size={22} color="#fff" /></TouchableOpacity>
        <Text style={{ color: '#fff', fontSize: 21, fontWeight: '800', marginLeft: 8 }}>Survival Manual</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 120, width: '100%', maxWidth: 1200, alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
        <TextInput
          value={q} onChangeText={setQ}
          placeholder="Search the manual: snare, purify, splint, shelter..."
          placeholderTextColor={colors.textMuted}
          style={{ backgroundColor: colors.surface, color: colors.text, borderRadius: 10, padding: 12, fontSize: 16, marginBottom: 12 }}
        />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5 }}>
          {results.map(({ c, count }) => (
            <View key={c.id} style={{ width: `${100 / cols}%`, padding: 5 }}>
              <TouchableOpacity onPress={() => openChapter(c.id)} style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 16, flexDirection: 'row', alignItems: 'center', minHeight: 64 }}>
                <Icon name={ICONS[c.id] || 'book-open'} size={22} color="#3F6212" />
                <Text style={{ color: colors.text, fontSize: 17, fontWeight: '600', marginLeft: 12, flex: 1 }}>{c.title}</Text>
                {count > 0 && <Text style={{ color: colors.textMuted, fontSize: 12 }}>{count >= 50 ? 'title' : `${count}×`}</Text>}
              </TouchableOpacity>
            </View>
          ))}
        </View>
        {results.length === 0 && <Text style={{ color: colors.textSecondary, marginTop: 10 }}>Nothing found. Try one simple word.</Text>}
      </ScrollView>
    </SafeAreaView>
  );
};
