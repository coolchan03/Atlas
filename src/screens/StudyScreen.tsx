import React, { useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, TextInput, TouchableOpacity, View, Modal, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../theme';
import { useProjectStore } from '../stores';
import { MarkdownText } from '../components/MarkdownText';
import { generate, useStudyStore, StudyResult, Source } from '../study/engine';
import { speakAndWait, stop } from '../atlasVoice/tts';

const KINDS: { kind: StudyResult['kind']; label: string; icon: string; desc: string }[] = [
  { kind: 'guide', label: 'Study guide', icon: 'book', desc: 'Summary, key ideas, terms' },
  { kind: 'cards', label: 'Flashcards', icon: 'layers', desc: 'Tap to flip' },
  { kind: 'quiz', label: 'Quiz', icon: 'check-square', desc: 'Multiple choice' },
  { kind: 'outline', label: 'Mind map', icon: 'share-2', desc: 'Outline of the topic' },
  { kind: 'podcast', label: 'Podcast', icon: 'headphones', desc: 'Two hosts explain it aloud' },
  { kind: 'slides', label: 'Video (slides)', icon: 'film', desc: 'Narrated slideshow' },
];

/** Sources row: [1] [2] ... tap to read the exact passage an item came from. */
function SourceChips({ nums, sources, onOpen, colors }: { nums: number[]; sources: Source[]; onOpen: (s: Source) => void; colors: any }) {
  const list = nums.map((n) => sources.find((s) => s.n === n)).filter(Boolean) as Source[];
  if (!list.length) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 }}>
      {list.map((s) => (
        <TouchableOpacity key={s.n} onPress={() => onOpen(s)} style={{ backgroundColor: colors.background, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, marginRight: 6, marginTop: 4 }}>
          <Text style={{ color: colors.primary, fontSize: 12 }}>[{s.n}] {s.doc.replace(/\.(md|txt|pdf)$/i, '').slice(0, 28)}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export const StudyScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const projectId: string = route.params?.projectId;
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const project = useProjectStore((s) => s.projects.find((p) => p.id === projectId));
  const savedRaw = useStudyStore((s) => s.saved[projectId]);
  const saved = savedRaw || [];
  const add = useStudyStore((s) => s.add);
  const remove = useStudyStore((s) => s.remove);
  const [topic, setTopic] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [view, setView] = useState<StudyResult | null>(null);
  const [src, setSrc] = useState<Source | null>(null);
  const [flipped, setFlipped] = useState<Record<number, boolean>>({});
  const [picked, setPicked] = useState<Record<number, number>>({});
  const [playing, setPlaying] = useState<number | null>(null);
  const stopRef = useRef(false);

  const run = async (kind: StudyResult['kind']) => {
    if (kind === 'answer' && !topic.trim()) { Alert.alert('Type a question first'); return; }
    setBusy(kind === 'answer' ? 'Answering' : KINDS.find((k) => k.kind === kind)?.label || kind);
    try {
      const r = await generate(projectId, kind, topic);
      add(projectId, r);
      setFlipped({}); setPicked({});
      setView(r);
    } catch (e: any) {
      Alert.alert('Could not make it', String(e?.message || e));
    } finally { setBusy(null); }
  };

  const play = async (items: { text: string; pitch: number }[]) => {
    stopRef.current = false;
    for (let i = 0; i < items.length; i++) {
      if (stopRef.current) break;
      setPlaying(i);
      const ok = await speakAndWait(items[i].text, items[i].pitch);
      if (!ok) break;
    }
    setPlaying(null);
  };
  const halt = () => { stopRef.current = true; stop(); setPlaying(null); };

  const openSource = (s: Source) => setSrc(s);
  const card = { backgroundColor: colors.surface, borderRadius: 10, padding: 14, marginBottom: 10 };

  const header = (title: string, back: () => void) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <TouchableOpacity onPress={back} style={{ marginRight: 12 }}><Icon name="arrow-left" size={20} color={colors.text} /></TouchableOpacity>
      <Text style={{ color: colors.text, fontSize: 18, fontWeight: '600', flex: 1 }} numberOfLines={1}>{title}</Text>
      {busy && <ActivityIndicator color={colors.primary} />}
    </View>
  );

  const sourceModal = (
    <Modal visible={!!src} transparent animationType="fade" onRequestClose={() => setSrc(null)}>
      <TouchableOpacity activeOpacity={1} onPress={() => setSrc(null)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 }}>
        <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 16, maxHeight: '75%' }}>
          <Text style={{ color: colors.primary, fontWeight: '700' }}>Source [{src?.n}]</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 8 }}>{src?.doc} · part {src?.part}</Text>
          <ScrollView><Text style={{ color: colors.text, fontSize: 15, lineHeight: 22 }}>{src?.text}</Text></ScrollView>
        </View>
      </TouchableOpacity>
    </Modal>
  );

  if (view) {
    const v = view;
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
        {header(`${KINDS.find((k) => k.kind === v.kind)?.label || 'Answer'}${v.topic ? `: ${v.topic}` : ''}`, () => { halt(); setView(null); })}
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120, width: '100%', maxWidth: 920, alignSelf: 'center' }}>
          {!!v.text && (
            <View style={card}>
              <MarkdownText>{v.text}</MarkdownText>
              <SourceChips nums={[...new Set([...v.text.matchAll(/\[(\d{1,2})\]/g)].map((m) => Number(m[1])))]} sources={v.sources} onOpen={openSource} colors={colors} />
            </View>
          )}
          {v.cards?.map((c, i) => (
            <TouchableOpacity key={i} style={[card, { minHeight: 90, justifyContent: 'center' }]} onPress={() => setFlipped((f) => ({ ...f, [i]: !f[i] }))}>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>{flipped[i] ? 'Answer' : `Card ${i + 1} · tap to flip`}</Text>
              <Text style={{ color: colors.text, fontSize: 18, fontWeight: flipped[i] ? '400' : '600', marginTop: 4 }}>{flipped[i] ? c.a : c.q}</Text>
              {flipped[i] && <SourceChips nums={c.src} sources={v.sources} onOpen={openSource} colors={colors} />}
            </TouchableOpacity>
          ))}
          {v.quiz?.map((q, i) => (
            <View key={i} style={card}>
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>{i + 1}. {q.q}</Text>
              {q.options.map((o, j) => {
                const chosen = picked[i] === j;
                const show = picked[i] !== undefined;
                const right = j === q.answer;
                return (
                  <TouchableOpacity key={j} disabled={show} onPress={() => setPicked((p) => ({ ...p, [i]: j }))}
                    style={{ marginTop: 8, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: show && right ? '#16A34A' : chosen ? colors.error : colors.border, backgroundColor: show && right ? 'rgba(22,163,74,0.12)' : 'transparent' }}>
                    <Text style={{ color: colors.text }}>{'ABCD'[j]}) {o}</Text>
                  </TouchableOpacity>
                );
              })}
              {picked[i] !== undefined && (
                <View>
                  <Text style={{ color: picked[i] === q.answer ? '#16A34A' : colors.error, marginTop: 8, fontWeight: '600' }}>{picked[i] === q.answer ? 'Correct' : `Answer: ${'ABCD'[q.answer]}`}</Text>
                  {!!q.why && <Text style={{ color: colors.textSecondary, marginTop: 2 }}>{q.why}</Text>}
                  <SourceChips nums={q.src} sources={v.sources} onOpen={openSource} colors={colors} />
                </View>
              )}
            </View>
          ))}
          {v.quiz && Object.keys(picked).length === v.quiz.length && (
            <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700', textAlign: 'center', marginVertical: 8 }}>
              Score: {v.quiz.filter((q, i) => picked[i] === q.answer).length} / {v.quiz.length}
            </Text>
          )}
          {v.podcast && (
            <View>
              <TouchableOpacity onPress={() => (playing !== null ? halt() : play(v.podcast!.map((l) => ({ text: l.text, pitch: l.host === 'A' ? 1.15 : 0.85 }))))}
                style={{ backgroundColor: colors.primary, borderRadius: 10, padding: 14, alignItems: 'center', marginBottom: 12, flexDirection: 'row', justifyContent: 'center' }}>
                <Icon name={playing !== null ? 'square' : 'play'} size={18} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '700', marginLeft: 8 }}>{playing !== null ? 'Stop' : 'Play podcast'}</Text>
              </TouchableOpacity>
              {v.podcast.map((l, i) => (
                <View key={i} style={[card, { borderLeftWidth: 4, borderLeftColor: l.host === 'A' ? '#2563EB' : '#D97706', opacity: playing === null || playing === i ? 1 : 0.55 }]}>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>{l.host === 'A' ? 'Host A' : 'Host B'}</Text>
                  <Text style={{ color: colors.text, fontSize: 16 }}>{l.text}</Text>
                </View>
              ))}
              <SourceChips nums={v.sources.map((s) => s.n)} sources={v.sources} onOpen={openSource} colors={colors} />
            </View>
          )}
          {v.slides && (
            <View>
              <TouchableOpacity onPress={() => (playing !== null ? halt() : play(v.slides!.map((s) => ({ text: `${s.title}. ${s.narration}`, pitch: 1 }))))}
                style={{ backgroundColor: colors.primary, borderRadius: 10, padding: 14, alignItems: 'center', marginBottom: 12, flexDirection: 'row', justifyContent: 'center' }}>
                <Icon name={playing !== null ? 'square' : 'play'} size={18} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '700', marginLeft: 8 }}>{playing !== null ? 'Stop' : 'Play video'}</Text>
              </TouchableOpacity>
              {(playing !== null ? [v.slides[playing]] : v.slides).map((s, i) => (
                <View key={i} style={[card, { minHeight: playing !== null ? Math.min(420, width * 0.7) : undefined, justifyContent: 'center', backgroundColor: playing !== null ? '#0F172A' : colors.surface }]}>
                  <Text style={{ color: playing !== null ? '#fff' : colors.text, fontSize: playing !== null ? 26 : 18, fontWeight: '700' }}>{s.title}</Text>
                  {s.bullets.map((b, j) => <Text key={j} style={{ color: playing !== null ? '#CBD5E1' : colors.textSecondary, fontSize: playing !== null ? 19 : 15, marginTop: 6 }}>• {b}</Text>)}
                  <SourceChips nums={s.src} sources={v.sources} onOpen={openSource} colors={colors} />
                </View>
              ))}
            </View>
          )}
        </ScrollView>
        {sourceModal}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      {header(`Study: ${project?.name || ''}`, () => navigation.goBack())}
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120, width: '100%', maxWidth: 920, alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
        <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18, marginBottom: 10 }}>
          Made from this project's documents by the AI on your phone. Every answer, card and question shows [numbers] - tap one to read the exact passage it came from.
        </Text>
        <TextInput value={topic} onChangeText={setTopic} placeholder="Topic or question (optional): e.g. treating burns"
          placeholderTextColor={colors.textMuted} style={{ backgroundColor: colors.surface, color: colors.text, borderRadius: 10, padding: 12, fontSize: 15 }} />
        <TouchableOpacity onPress={() => run('answer')} disabled={!!busy} style={{ backgroundColor: colors.primary, borderRadius: 10, padding: 12, alignItems: 'center', marginTop: 8 }}>
          <Text style={{ color: '#fff', fontWeight: '600' }}>{busy === 'Answering' ? 'Answering...' : 'Ask with sources'}</Text>
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5, marginTop: 10 }}>
          {KINDS.map((k) => (
            <View key={k.kind} style={{ width: width >= 700 ? '33.3%' : '50%', padding: 5 }}>
              <TouchableOpacity disabled={!!busy} onPress={() => run(k.kind)} style={[card, { marginBottom: 0, minHeight: 84 }]}>
                <Icon name={k.icon} size={20} color={colors.primary} />
                <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600', marginTop: 6 }}>{busy === k.label ? 'Making...' : k.label}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{k.desc}</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
        {busy && <Text style={{ color: colors.textSecondary, marginTop: 10 }}>Working on it - this can take a minute on a phone.</Text>}
        {saved.length > 0 && <Text style={{ color: colors.text, fontWeight: '700', marginTop: 18, marginBottom: 6 }}>Saved</Text>}
        {saved.map((r) => (
          <TouchableOpacity key={r.createdAt} style={[card, { flexDirection: 'row', alignItems: 'center' }]} onPress={() => { setFlipped({}); setPicked({}); setView(r); }}>
            <Icon name={KINDS.find((k) => k.kind === r.kind)?.icon || 'message-circle'} size={18} color={colors.primary} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={{ color: colors.text, fontWeight: '600' }}>{KINDS.find((k) => k.kind === r.kind)?.label || 'Answer'}{r.topic ? `: ${r.topic}` : ''}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>{new Date(r.createdAt).toLocaleString()}</Text>
            </View>
            <TouchableOpacity onPress={() => remove(projectId, r.createdAt)} style={{ padding: 6 }}><Icon name="trash-2" size={16} color={colors.textMuted} /></TouchableOpacity>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {sourceModal}
    </SafeAreaView>
  );
};
