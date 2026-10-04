import React, { useMemo, useRef, useState } from 'react';
import { BackHandler, Image, Linking, Modal, ScrollView, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect, useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Feather';
import Markdown from '@ronradtke/react-native-markdown-display';
import { useTheme } from '../theme';
import { useEmergencyColors, useOffGrid } from '../atlasTools/offGrid';
import { SURVIVAL_CHAPTERS, SurvivalChapter } from '../survival/content';
import { SURVIVAL_IMAGES } from '../survival/images';
import { useSurvivalStore } from '../survival/store';
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

function ManualImage({ src, alt, width, onZoom }: { src: string; alt: string; width: number; onZoom: (src: string, alt: string) => void }) {
  const mod = SURVIVAL_IMAGES[src];
  if (!mod) return null;
  const meta = Image.resolveAssetSource(mod);
  const w = Math.min(width, meta?.width ? meta.width * 1.6 : width);
  const h = meta?.width ? (w * meta.height) / meta.width : w * 0.6;
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={() => onZoom(src, alt)} style={{ alignItems: 'center', marginVertical: 10 }}>
      <Image source={mod} style={{ width: w, height: h, backgroundColor: '#fff', borderRadius: 6 }} resizeMode="contain" accessibilityLabel={alt} />
      {!!alt && <Text style={{ fontSize: 12, color: '#888', marginTop: 4, textAlign: 'center' }}>{alt} (tap to enlarge)</Text>}
    </TouchableOpacity>
  );
}

/** Own state while typing, saved when you leave the box - so the long chapter does not re-render per key. */
function NotesBox({ id, colors }: { id: string; colors: any }) {
  const [text, setText] = useState(() => useSurvivalStore.getState().notes[id] || '');
  const save = () => useSurvivalStore.getState().setNote(id, text);
  React.useEffect(() => () => { useSurvivalStore.getState().setNote(id, textRef.current); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const textRef = useRef(text);
  textRef.current = text;
  return (
    <TextInput
      value={text}
      onChangeText={setText}
      onBlur={save}
      placeholder="Add your own notes for this chapter (saved on this phone)"
      placeholderTextColor={colors.textMuted}
      multiline
      textAlignVertical="top"
      style={{ backgroundColor: colors.surface, color: colors.text, borderRadius: 8, padding: 12, minHeight: 90, marginTop: 8, fontSize: 15 }}
    />
  );
}

/** The Survival Manual (ligi/SurvivalManual, based on US Army FM 21-76), fully offline with pictures. */
export const SurvivalManualScreen: React.FC = () => {
  React.useEffect(() => () => stop(), []); // stop reading aloud when leaving the screen
  const navigation = useNavigation<any>();
  const { colors: baseColors } = useTheme();
  const colors = useEmergencyColors(baseColors);
  const night = useOffGrid((st) => st.nightRed);
  const setNight = useOffGrid((st) => st.setNightRed);
  const bar = (c: string) => (night ? '#2A0000' : c);
  const { width } = useWindowDimensions();
  const route = useRoute<any>();
  const [chapter, setChapter] = useState<SurvivalChapter | null>(() => SURVIVAL_CHAPTERS.find((c) => c.id === route.params?.chapterId) || null);
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
    if (!s) return SURVIVAL_CHAPTERS.map((c) => ({ c, count: 0, titleHit: false }));
    return SURVIVAL_CHAPTERS
      .map((c) => {
        const titleHit = c.title.toLowerCase().includes(s);
        const body = (c.md.toLowerCase().match(new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
        return { c, count: body, titleHit, rank: body + (titleHit ? 1000 : 0) };
      })
      .filter((x) => x.count > 0 || x.titleHit)
      .sort((a, b) => b.rank - a.rank);
  }, [q]);

  const setPos = useSurvivalStore((st) => st.setPos);
  const [zoom, setZoom] = useState<{ src: string; alt: string } | null>(null);
  const lastSave = useRef(0);

  const openChapter = (id: string) => {
    const c = SURVIVAL_CHAPTERS.find((x) => x.id === id);
    if (!c) return;
    stop();
    setChapter(c);
    // Pick up where you left off in this chapter.
    const y = useSurvivalStore.getState().pos[id] || 0;
    setTimeout(() => scrollRef.current?.scrollTo({ y, animated: false }), 350);
  };

  const snippetFor = (c: SurvivalChapter, term: string) => {
    const s = term.trim().toLowerCase();
    if (!s) return '';
    const plainMd = c.md.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/[#*>_`]/g, '');
    const i = plainMd.toLowerCase().indexOf(s);
    if (i < 0) return '';
    return `...${plainMd.slice(Math.max(0, i - 50), i + s.length + 70).replace(/\s+/g, ' ').trim()}...`;
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
    image: (node: any) => <ManualImage key={node.key} src={node.attributes?.src || ''} alt={node.attributes?.alt || node.content || ''} width={colW} onZoom={(src, alt) => setZoom({ src, alt })} />,
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
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: bar('#3F6212') }}>
          <TouchableOpacity onPress={() => { stop(); setChapter(null); }} style={{ padding: 6 }}><Icon name="arrow-left" size={22} color="#fff" /></TouchableOpacity>
          <Text style={{ color: '#fff', fontSize: 19, fontWeight: '700', flex: 1, marginLeft: 8 }} numberOfLines={1}>{chapter.title}</Text>
          <TouchableOpacity onPress={() => (speaking ? stop() : speak(prepareMessageForSpeech(chapter.md.replace(/!\[[^\]]*\]\([^)]*\)/g, '')), 'survival-chapter'))} style={{ padding: 8 }}>
            <Icon name={speaking ? 'volume-x' : 'volume-2'} size={20} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setSize((s) => Math.max(13, s - 2))} style={{ padding: 8 }}><Text style={{ color: '#fff' }}>A-</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => setSize((s) => Math.min(28, s + 2))} style={{ padding: 8 }}><Text style={{ color: '#fff', fontSize: 18 }}>A+</Text></TouchableOpacity>
        </View>
        <ScrollView
          ref={scrollRef}
          scrollEventThrottle={500}
          onScroll={(e) => {
            const now = Date.now();
            if (now - lastSave.current > 1500) { lastSave.current = now; setPos(chapter.id, e.nativeEvent.contentOffset.y); }
          }}
          contentContainerStyle={{ padding: 18, paddingBottom: 120, width: '100%', maxWidth: 920, alignSelf: 'center' }}
          keyboardShouldPersistTaps="handled"
        >
          <Markdown style={mdStyles} rules={rules} onLinkPress={onLink}>{chapter.md}</Markdown>
          <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700', marginTop: 24 }}>My notes</Text>
          <NotesBox key={chapter.id} id={chapter.id} colors={colors} />
          <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 24 }}>
            From the Survival Manual (github.com/ligi/SurvivalManual), based on US Army FM 21-76. Community edited; not medical advice.
          </Text>
        </ScrollView>
        <Modal visible={!!zoom} transparent={false} animationType="fade" onRequestClose={() => setZoom(null)}>
          <TouchableOpacity activeOpacity={1} onPress={() => setZoom(null)} style={{ flex: 1, backgroundColor: '#fff', justifyContent: 'center' }}>
            {zoom && SURVIVAL_IMAGES[zoom.src] && (
              <Image source={SURVIVAL_IMAGES[zoom.src]} style={{ width: '100%', height: '85%' }} resizeMode="contain" />
            )}
            <Text style={{ textAlign: 'center', color: '#333', padding: 12 }}>{zoom?.alt} · tap to close (turn the phone sideways for more detail)</Text>
          </TouchableOpacity>
        </Modal>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: bar('#3F6212') }}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 6 }}><Icon name="arrow-left" size={22} color="#fff" /></TouchableOpacity>
        <Text style={{ color: '#fff', fontSize: 21, fontWeight: '800', marginLeft: 8, flex: 1 }}>Survival Manual</Text>
        <TouchableOpacity onPress={() => setNight(!night)} style={{ padding: 8 }} accessibilityLabel="Red night mode"><Icon name="moon" size={20} color="#fff" /></TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 120, width: '100%', maxWidth: 1200, alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
        <TextInput
          value={q} onChangeText={setQ}
          placeholder="Search the manual: snare, purify, splint, shelter..."
          placeholderTextColor={colors.textMuted}
          style={{ backgroundColor: colors.surface, color: colors.text, borderRadius: 10, padding: 12, fontSize: 16, marginBottom: 12 }}
        />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5 }}>
          {results.map(({ c, count, titleHit }) => (
            <View key={c.id} style={{ width: `${100 / cols}%`, padding: 5 }}>
              <TouchableOpacity onPress={() => openChapter(c.id)} style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 16, flexDirection: 'row', alignItems: 'center', minHeight: 64 }}>
                <Icon name={ICONS[c.id] || 'book-open'} size={22} color="#3F6212" />
                <Text style={{ color: colors.text, fontSize: 17, fontWeight: '600', marginLeft: 12, flex: 1 }}>{c.title}</Text>
                {(count > 0 || titleHit) && <Text style={{ color: colors.textMuted, fontSize: 12 }}>{titleHit ? 'title' : `${count}×`}</Text>}
              </TouchableOpacity>
              {!!q.trim() && count > 0 && !titleHit && (
                <Text style={{ color: colors.textSecondary, fontSize: 12, paddingHorizontal: 8, paddingTop: 4 }} numberOfLines={2}>{snippetFor(c, q)}</Text>
              )}
            </View>
          ))}
        </View>
        {results.length === 0 && <Text style={{ color: colors.textSecondary, marginTop: 10 }}>Nothing found. Try one simple word.</Text>}
      </ScrollView>
    </SafeAreaView>
  );
};
