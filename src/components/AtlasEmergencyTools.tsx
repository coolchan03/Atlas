/**
 * Emergency-mode tools (work with no model and no internet): survival drills,
 * survival picture quiz, phrase practice, SOS / Morse signal, daylight left,
 * and preparedness checklists.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Modal, NativeModules, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../theme';
import { DRILLS, type Drill } from '../survival/drills';
import { SURVIVAL_CHAPTERS } from '../survival/content';
import { SURVIVAL_IMAGES } from '../survival/images';
import { PHRASES_EN, PHRASE_LANGUAGES } from '../phrases/data';
import { speakIn, stop } from '../atlasVoice/tts';
import { morseTimeline, toMorse } from '../atlasTools/morse';
import { formatDuration, sunTimes } from '../atlasTools/sun';
import { expiringSoon, useChecklists } from '../atlasTools/checklists';
import { shuffle } from '../study/games/logic';

type Tool = 'menu' | 'drills' | 'pictures' | 'phrases' | 'signal' | 'daylight' | 'checklists';
const TOOLS: { id: Exclude<Tool, 'menu'>; title: string; desc: string; icon: string }[] = [
  { id: 'drills', title: 'Survival drills', desc: 'What would you do? Scenarios checked against the emergency cards', icon: 'target' },
  { id: 'signal', title: 'SOS signal', desc: 'Flash SOS or any message in Morse with the screen or flashlight', icon: 'zap' },
  { id: 'daylight', title: 'Daylight left', desc: 'Sunrise and sunset from GPS, with a turn-back time', icon: 'sunset' },
  { id: 'checklists', title: 'Kit checklists', desc: 'Go-bag, 72-hour, car and first-aid kits with expiry dates', icon: 'check-square' },
  { id: 'pictures', title: 'Survival picture quiz', desc: 'Name the figures from the Survival Manual', icon: 'image' },
  { id: 'phrases', title: 'Phrase practice', desc: 'Listen and recall emergency phrases in other languages', icon: 'globe' },
];

export function AtlasEmergencyTools({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const [tool, setTool] = useState<Tool>('menu');
  const close = () => { stop(); setTool('menu'); onClose(); };
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={() => (tool === 'menu' ? close() : setTool('menu'))}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <TouchableOpacity onPress={() => (tool === 'menu' ? close() : setTool('menu'))} accessibilityLabel="Back" style={{ padding: 8 }}>
            <Icon name="arrow-left" size={22} color={colors.text} />
          </TouchableOpacity>
          <Text style={{ color: colors.text, fontSize: 19, fontWeight: '700', marginLeft: 6 }}>{tool === 'menu' ? 'Emergency tools' : TOOLS.find((t) => t.id === tool)?.title}</Text>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 80, width: '100%', maxWidth: 820, alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
          {tool === 'menu' && TOOLS.map((t) => (
            <TouchableOpacity key={t.id} onPress={() => setTool(t.id)} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, backgroundColor: colors.surface, marginBottom: 10 }}>
              <Icon name={t.icon} size={22} color={colors.primary} />
              <View style={{ marginLeft: 12, flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700' }}>{t.title}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{t.desc}</Text>
              </View>
            </TouchableOpacity>
          ))}
          {tool === 'drills' && <Drills />}
          {tool === 'pictures' && <PictureQuiz />}
          {tool === 'phrases' && <PhrasePractice />}
          {tool === 'signal' && <SignalTool />}
          {tool === 'daylight' && <Daylight />}
          {tool === 'checklists' && <Checklists />}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function Btn({ label, onPress, primary = true, disabled }: { label: string; onPress: () => void; primary?: boolean; disabled?: boolean }) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} accessibilityRole="button"
      style={{ padding: 13, borderRadius: 10, marginVertical: 5, minHeight: 48, justifyContent: 'center', backgroundColor: primary ? colors.primary : colors.surface, borderWidth: primary ? 0 : 1, borderColor: colors.border, opacity: disabled ? 0.5 : 1 }}>
      <Text style={{ color: primary ? '#fff' : colors.text, textAlign: 'center', fontWeight: '700' }}>{label}</Text>
    </TouchableOpacity>
  );
}

// ----------------------------------------------------------------- survival drills
function Drills() {
  const { colors } = useTheme();
  const [drill, setDrill] = useState<Drill | null>(null);
  const [node, setNode] = useState('');
  const [feedback, setFeedback] = useState<{ good: boolean; why: string; card: string; next: string | null } | null>(null);
  const [score, setScore] = useState({ good: 0, total: 0 });
  if (!drill) {
    return (
      <View>
        <Text style={{ color: colors.textSecondary, marginBottom: 8 }}>Practise the right first steps before you need them. Every answer names the emergency card it comes from.</Text>
        {DRILLS.map((d) => (
          <TouchableOpacity key={d.id} onPress={() => { setDrill(d); setNode(d.start); setFeedback(null); setScore({ good: 0, total: 0 }); }} style={{ flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 10, backgroundColor: colors.surface, marginBottom: 8 }}>
            <Icon name={d.icon} size={20} color={colors.primary} />
            <Text style={{ color: colors.text, fontSize: 16, marginLeft: 10 }}>{d.title}</Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  }
  const current = drill.nodes[node];
  if (!current) {
    return (
      <View>
        <Text style={{ color: colors.text, fontSize: 22, fontWeight: '800' }}>{score.good === score.total ? 'Well done!' : 'Drill finished'}</Text>
        <Text style={{ color: colors.textSecondary, marginVertical: 6 }}>{score.good} of {score.total} best choices. Read the matching emergency cards to lock it in.</Text>
        <Btn label="Try it again" onPress={() => { setNode(drill.start); setScore({ good: 0, total: 0 }); }} />
        <Btn label="Other drills" primary={false} onPress={() => setDrill(null)} />
      </View>
    );
  }
  return (
    <View>
      <Text style={{ color: colors.text, fontSize: 18, lineHeight: 26, marginBottom: 10 }}>{current.text}</Text>
      {!feedback ? current.choices.map((c, i) => (
        <TouchableOpacity key={i} onPress={() => { setFeedback({ good: c.good, why: c.why, card: c.card, next: c.next }); setScore((s) => ({ good: s.good + (c.good ? 1 : 0), total: s.total + 1 })); }}
          style={{ padding: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, marginBottom: 8 }}>
          <Text style={{ color: colors.text, fontSize: 16 }}>{c.text}</Text>
        </TouchableOpacity>
      )) : (
        <View style={{ padding: 14, borderRadius: 10, backgroundColor: feedback.good ? '#16A34A33' : '#DC262633' }}>
          <Text style={{ color: colors.text, fontWeight: '800', fontSize: 17 }}>{feedback.good ? 'Good call' : 'Not the best choice'}</Text>
          <Text style={{ color: colors.text, marginTop: 4, lineHeight: 22 }}>{feedback.why}</Text>
          <Text style={{ color: colors.textMuted, marginTop: 4, fontSize: 12 }}>From emergency card {feedback.card}</Text>
          <Btn label="Continue" onPress={() => { setNode(feedback.next ?? '__end'); setFeedback(null); }} />
        </View>
      )}
    </View>
  );
}

// ----------------------------------------------------------------- survival picture quiz
interface Figure { title: string; file: string; chapter: string }
function allFigures(): Figure[] {
  const out: Figure[] = [];
  const re = /!\[Figure [\d-]+\\?\.\s*([^\]]+)\]\((fig[\d-]+\.png)\)/g;
  for (const ch of SURVIVAL_CHAPTERS) {
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(ch.md))) {
      const title = m[1].replace(/\\/g, '').trim();
      if (SURVIVAL_IMAGES[m[2]] && title.length > 2 && !out.some((f) => f.title === title)) out.push({ title, file: m[2], chapter: ch.title });
    }
  }
  return out;
}
function PictureQuiz() {
  const { colors } = useTheme();
  const figures = useMemo(allFigures, []);
  const [round, setRound] = useState(() => shuffle(figures).slice(0, 10));
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const fig = round[i];
  const options = useMemo(() => (fig ? shuffle([fig.title, ...shuffle(figures.filter((f) => f.title !== fig.title)).slice(0, 3).map((f) => f.title)]) : []), [fig, figures]);
  if (figures.length < 4) return <Text style={{ color: colors.textSecondary }}>The Survival Manual pictures are not available in this build.</Text>;
  if (!fig) {
    return (
      <View>
        <Text style={{ color: colors.text, fontSize: 22, fontWeight: '800' }}>{score} / {round.length}</Text>
        <Btn label="New round" onPress={() => { setRound(shuffle(figures).slice(0, 10)); setI(0); setScore(0); setPicked(null); }} />
      </View>
    );
  }
  return (
    <View>
      <Text style={{ color: colors.textSecondary }}>Picture {i + 1} of {round.length} · score {score}</Text>
      <View style={{ backgroundColor: '#fff', borderRadius: 10, padding: 8, marginVertical: 8, alignItems: 'center' }}>
        <Image source={SURVIVAL_IMAGES[fig.file]} style={{ width: '100%', height: 240 }} resizeMode="contain" accessibilityLabel="Survival Manual figure" />
      </View>
      <Text style={{ color: colors.text, fontWeight: '600', marginBottom: 4 }}>What does this figure show?</Text>
      {options.map((o) => {
        const state = picked === null ? null : o === fig.title ? 'right' : o === picked ? 'wrong' : null;
        return (
          <TouchableOpacity key={o} disabled={picked !== null} onPress={() => { setPicked(o); if (o === fig.title) setScore((s) => s + 1); }}
            style={{ padding: 12, borderRadius: 10, borderWidth: 1, marginVertical: 4, borderColor: state === 'right' ? '#16A34A' : state === 'wrong' ? '#DC2626' : colors.border, backgroundColor: state === 'right' ? '#16A34A33' : state === 'wrong' ? '#DC262633' : colors.surface }}>
            <Text style={{ color: colors.text }}>{o}</Text>
          </TouchableOpacity>
        );
      })}
      {picked !== null && (
        <View>
          <Text style={{ color: colors.textSecondary, marginTop: 4 }}>From the chapter “{fig.chapter}”.</Text>
          <Btn label="Next picture" onPress={() => { setPicked(null); setI((x) => x + 1); }} />
        </View>
      )}
    </View>
  );
}

// ----------------------------------------------------------------- phrase practice
function PhrasePractice() {
  const { colors } = useTheme();
  const [lang, setLang] = useState(PHRASE_LANGUAGES[0]);
  const [mode, setMode] = useState<'listen' | 'recall'>('listen');
  const [order, setOrder] = useState(() => shuffle(PHRASES_EN.map((_, k) => k)));
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [shown, setShown] = useState(false);
  const [score, setScore] = useState(0);
  const idx = order[i % order.length];
  const phrase = lang.phrases[idx];
  const options = useMemo(() => shuffle([idx, ...shuffle(PHRASES_EN.map((_, k) => k).filter((k) => k !== idx)).slice(0, 3)]), [idx]);
  useEffect(() => () => stop(), []);
  const say = () => phrase && speakIn(phrase[0], lang.code, 'phrase-practice');
  useEffect(() => { if (mode === 'listen') setTimeout(say, 300); }, [i, mode, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  const next = () => { setPicked(null); setShown(false); setI((x) => x + 1); };
  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
        {PHRASE_LANGUAGES.map((l) => (
          <TouchableOpacity key={l.code} onPress={() => { setLang(l); setOrder(shuffle(PHRASES_EN.map((_, k) => k))); setI(0); setScore(0); setPicked(null); setShown(false); }}
            style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, marginRight: 6, backgroundColor: l.code === lang.code ? colors.primary : colors.surface }}>
            <Text style={{ color: l.code === lang.code ? '#fff' : colors.text }}>{l.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {(['listen', 'recall'] as const).map((m) => (
          <TouchableOpacity key={m} onPress={() => { setMode(m); setPicked(null); setShown(false); }} style={{ padding: 8, borderRadius: 8, backgroundColor: mode === m ? colors.primary : colors.surface }}>
            <Text style={{ color: mode === m ? '#fff' : colors.text }}>{m === 'listen' ? 'Listen: pick the meaning' : 'Recall: say it yourself'}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={{ color: colors.textSecondary, marginVertical: 6 }}>Score {score} · phrase {i + 1}</Text>
      {mode === 'listen' ? (
        <View>
          <Btn label="🔊 Play again" primary={false} onPress={say} />
          {picked !== null && <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700', marginVertical: 6 }}>{phrase?.[0]}{phrase?.[1] ? `\n${phrase[1]}` : ''}</Text>}
          {options.map((k) => {
            const state = picked === null ? null : k === idx ? 'right' : k === picked ? 'wrong' : null;
            return (
              <TouchableOpacity key={k} disabled={picked !== null} onPress={() => { setPicked(k); if (k === idx) setScore((s) => s + 1); }}
                style={{ padding: 12, borderRadius: 10, borderWidth: 1, marginVertical: 4, borderColor: state === 'right' ? '#16A34A' : state === 'wrong' ? '#DC2626' : colors.border, backgroundColor: colors.surface }}>
                <Text style={{ color: colors.text }}>{PHRASES_EN[k]}</Text>
              </TouchableOpacity>
            );
          })}
          {picked !== null && <Btn label="Next phrase" onPress={next} />}
        </View>
      ) : (
        <View>
          <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>{PHRASES_EN[idx]}</Text>
          <Text style={{ color: colors.textSecondary, marginBottom: 6 }}>Say it in {lang.name} out loud, then check.</Text>
          {!shown ? <Btn label="Show and play" onPress={() => { setShown(true); say(); }} /> : (
            <View>
              <Text style={{ color: colors.primary, fontSize: 22, fontWeight: '800' }}>{phrase?.[0]}</Text>
              {!!phrase?.[1] && <Text style={{ color: colors.textSecondary }}>{phrase[1]}</Text>}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}><Btn label="Missed it" primary={false} onPress={next} /></View>
                <View style={{ flex: 1 }}><Btn label="Got it" onPress={() => { setScore((s) => s + 1); next(); }} /></View>
              </View>
            </View>
          )}
        </View>
      )}
      <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 8 }}>Phrases were written by AI and not yet checked by native speakers.</Text>
    </View>
  );
}

// ----------------------------------------------------------------- SOS / Morse signal
const UNIT_MS = 220;
function SignalTool() {
  const { colors } = useTheme();
  const [text, setText] = useState('SOS');
  const [running, setRunning] = useState(false);
  const [lit, setLit] = useState(false);
  const [torch, setTorch] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const device: any = NativeModules.AtlasDevice;
  const setLight = (on: boolean) => {
    setLit(on);
    if (torch && Platform.OS === 'android') device?.setTorch?.(on)?.catch?.(() => undefined);
  };
  const halt = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setRunning(false); setLight(false);
    device?.setKeepScreenOn?.(false)?.catch?.(() => undefined);
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); device?.setTorch?.(false)?.catch?.(() => undefined); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const start = () => {
    const steps = morseTimeline(text || 'SOS', true);
    if (!steps.length) return;
    setRunning(true);
    device?.setKeepScreenOn?.(true)?.catch?.(() => undefined);
    let k = 0;
    const tick = () => {
      const s = steps[k % steps.length];
      setLight(s.on);
      k++;
      timer.current = setTimeout(tick, s.units * UNIT_MS);
    };
    tick();
  };
  if (running) {
    return (
      <TouchableOpacity activeOpacity={1} onPress={halt} accessibilityLabel="Stop signalling"
        style={{ height: 520, borderRadius: 16, backgroundColor: lit ? '#FFFFFF' : '#000000', justifyContent: 'flex-end', alignItems: 'center', padding: 16 }}>
        <Text style={{ color: lit ? '#000' : '#888' }}>{toMorse(text)} · tap to stop</Text>
      </TouchableOpacity>
    );
  }
  return (
    <View>
      <Text style={{ color: colors.textSecondary, marginBottom: 8 }}>Flash a message in Morse code. At night a phone screen or flashlight can be seen from far away. Turn the screen brightness all the way up.</Text>
      <TextInput value={text} onChangeText={(v) => setText(v.toUpperCase().replace(/[^A-Z0-9 ]/g, '').slice(0, 30))} placeholder="SOS" placeholderTextColor={colors.textMuted}
        style={{ color: colors.text, backgroundColor: colors.surface, borderRadius: 10, padding: 12, fontSize: 18, letterSpacing: 2 }} />
      <Text style={{ color: colors.textMuted, marginVertical: 6 }}>{toMorse(text || 'SOS')}</Text>
      <TouchableOpacity onPress={() => setTorch((t) => !t)} accessibilityRole="switch" accessibilityState={{ checked: torch }} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8 }}>
        <Icon name={torch ? 'check-square' : 'square'} size={20} color={colors.primary} />
        <Text style={{ color: colors.text, marginLeft: 8 }}>Also flash the flashlight</Text>
      </TouchableOpacity>
      <Btn label="Start signalling" onPress={start} />
      <Text style={{ color: colors.textMuted, fontSize: 12 }}>SOS = ··· ––– ··· repeated. Also: 3 whistle blasts or 3 fires mean help (card S01).</Text>
    </View>
  );
}

// ----------------------------------------------------------------- daylight left
function Daylight() {
  const { colors } = useTheme();
  const fix = (() => { try { return require('../atlasMaps/maps').useMaps.getState().lastFix; } catch { return null; } })();
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);
  if (!fix) return <Text style={{ color: colors.textSecondary }}>No GPS position yet. Open Atlas → Maps once and allow location (works without internet), then come back.</Text>;
  const t = sunTimes(new Date(now), fix.lat, fix.lon);
  const fmt = (d: Date | null) => (d ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—');
  const left = t.sunset ? t.sunset.getTime() - now : 0;
  return (
    <View>
      {t.polar ? <Text style={{ color: colors.text, fontSize: 18 }}>{t.polar === 'day' ? 'The sun does not set today here.' : 'The sun does not rise today here.'}</Text> : (
        <View>
          <Text style={{ color: colors.text, fontSize: 18 }}>Sunrise {fmt(t.sunrise)} · Sunset {fmt(t.sunset)}</Text>
          <Text style={{ color: left > 0 ? colors.text : colors.error, fontSize: 30, fontWeight: '800', marginVertical: 10 }}>
            {left > 0 ? `${formatDuration(left)} of daylight left` : 'The sun has set'}
          </Text>
          {left > 0 && <Text style={{ color: colors.textSecondary, lineHeight: 21 }}>Turn back by {new Date(now + left / 2).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} if you need to return the way you came before dark (half the remaining daylight). Real dusk is darker under trees and in valleys.</Text>}
        </View>
      )}
      <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 10 }}>From your last GPS fix ({fix.lat.toFixed(3)}, {fix.lon.toFixed(3)}), computed on the phone.</Text>
    </View>
  );
}

// ----------------------------------------------------------------- checklists
function Checklists() {
  const { colors } = useTheme();
  const lists = useChecklists((s) => s.lists);
  const { toggle, setExpiry, add, remove, reset } = useChecklists.getState();
  const [open, setOpen] = useState(lists[0]?.id);
  const [newItem, setNewItem] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [expiryText, setExpiryText] = useState('');
  const soon = expiringSoon(lists);
  const list = lists.find((l) => l.id === open) ?? lists[0];
  return (
    <View>
      {soon.length > 0 && (
        <View style={{ padding: 12, borderRadius: 10, backgroundColor: '#CA8A0433', marginBottom: 8 }}>
          <Text style={{ color: colors.text, fontWeight: '700' }}>Expiring soon</Text>
          {soon.map(({ list: l, item }) => <Text key={item.id} style={{ color: colors.text }}>• {item.text} ({l}): {item.expires}</Text>)}
        </View>
      )}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {lists.map((l) => {
          const done = l.items.filter((i) => i.done).length;
          return (
            <TouchableOpacity key={l.id} onPress={() => setOpen(l.id)} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, marginRight: 6, backgroundColor: l.id === list.id ? colors.primary : colors.surface }}>
              <Text style={{ color: l.id === list.id ? '#fff' : colors.text }}>{l.title} {done}/{l.items.length}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      {list.items.map((it) => (
        <View key={it.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <TouchableOpacity onPress={() => toggle(list.id, it.id)} accessibilityRole="checkbox" accessibilityState={{ checked: it.done }} accessibilityLabel={it.text} style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
            <Icon name={it.done ? 'check-square' : 'square'} size={20} color={colors.primary} />
            <View style={{ marginLeft: 10, flex: 1 }}>
              <Text style={{ color: colors.text, textDecorationLine: it.done ? 'line-through' : 'none' }}>{it.text}</Text>
              {!!it.expires && <Text style={{ color: colors.textMuted, fontSize: 12 }}>Expires {it.expires}</Text>}
            </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { setEditing(it.id); setExpiryText(it.expires ?? ''); }} accessibilityLabel={`Set expiry for ${it.text}`} style={{ padding: 6 }}><Icon name="calendar" size={16} color={colors.textMuted} /></TouchableOpacity>
          <TouchableOpacity onPress={() => remove(list.id, it.id)} accessibilityLabel={`Remove ${it.text}`} style={{ padding: 6 }}><Icon name="x" size={16} color={colors.textMuted} /></TouchableOpacity>
        </View>
      ))}
      {editing && (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, alignItems: 'center' }}>
          <TextInput value={expiryText} onChangeText={setExpiryText} placeholder="Expiry date YYYY-MM-DD" placeholderTextColor={colors.textMuted} style={{ flex: 1, color: colors.text, backgroundColor: colors.surface, borderRadius: 8, padding: 10 }} />
          <TouchableOpacity onPress={() => { if (!expiryText || /^\d{4}-\d{2}-\d{2}$/.test(expiryText)) { setExpiry(list.id, editing, expiryText); setEditing(null); } }}><Text style={{ color: colors.primary, fontWeight: '700' }}>Save</Text></TouchableOpacity>
        </View>
      )}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, alignItems: 'center' }}>
        <TextInput value={newItem} onChangeText={setNewItem} placeholder="Add an item" placeholderTextColor={colors.textMuted} style={{ flex: 1, color: colors.text, backgroundColor: colors.surface, borderRadius: 8, padding: 10 }} />
        <TouchableOpacity onPress={() => { if (newItem.trim()) { add(list.id, newItem.trim()); setNewItem(''); } }}><Text style={{ color: colors.primary, fontWeight: '700' }}>Add</Text></TouchableOpacity>
      </View>
      <Btn label="Untick all (repack)" primary={false} onPress={() => reset(list.id)} />
    </View>
  );
}
