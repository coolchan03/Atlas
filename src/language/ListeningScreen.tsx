import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme, useThemedStyles } from '../theme';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Choice } from '../components/games/kit';
import { speakInAndWait, stop } from '../atlasVoice/tts';
import { LANGUAGES, MY_WORDS, languageService } from './languageService';
import { useLanguage } from './store';
import type { Listening } from './listening';
import { createStyles } from './ListeningScreen.styles';

/**
 * Story or podcast mode: easy text in the language, read aloud part by part, with a question
 * after each part and, at the end, the new words to save for practice.
 */
export const ListeningScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { kind, at } = useRoute<any>().params as { kind: Listening['kind']; at?: number };
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const code = useLanguage((s) => s.language);
  const saved = useLanguage((s) => s.listening[s.language]?.find((l) => l.createdAt === at));
  const langName = LANGUAGES.find((l) => l.code === code)?.name ?? code;
  const [piece, setPiece] = useState<Listening | null>(saved ?? null);
  const [topic, setTopic] = useState('');
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [part, setPart] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [english, setEnglish] = useState(false);
  const [playing, setPlaying] = useState(false);
  useEffect(() => () => stop(), []);

  const make = () => {
    setError(null); setStep('Starting...');
    languageService.makeListening(kind, topic, setStep)
      .then((p) => { setPiece(p); setPart(0); setPicked(null); })
      .catch((e) => setError(String(e?.message || e)))
      .finally(() => setStep(null));
  };
  const play = async () => {
    if (!piece) return;
    if (playing) { stop(); setPlaying(false); return; }
    setPlaying(true);
    for (const l of piece.parts[part].lines) { if (!(await speakInAndWait(l.t, code, 'listening'))) break; }
    setPlaying(false);
  };

  const header = (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton} accessibilityLabel="Back">
        <Icon name="arrow-left" size={20} color={colors.text} />
      </TouchableOpacity>
      <Text style={styles.title} numberOfLines={1}>{piece?.title ?? (kind === 'story' ? 'Story' : 'Podcast')}</Text>
    </View>
  );

  if (!piece) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {header}
        <ScrollView contentContainerStyle={styles.content}>
          <Card title={kind === 'story' ? `A short story in ${langName}` : `A short podcast in ${langName}`}
            subtitle="Easy words, read aloud, with a question after each part and your new words at the end.">
            <TextInput value={topic} onChangeText={setTopic} placeholder="Topic (optional), e.g. a day at the beach"
              placeholderTextColor={colors.textMuted} style={styles.input} testID="listening-topic" />
            {step ? <View style={styles.progressRow}><ActivityIndicator color={colors.primary} /><Text style={styles.body}>{step}</Text></View>
              : <Button title={kind === 'story' ? 'Write my story' : 'Make my podcast'} onPress={make} testID="listening-make" />}
            {!!error && <Text style={styles.error}>{error}</Text>}
            <Text style={styles.meta}>Written by the AI on your phone, so wording may be imperfect.</Text>
          </Card>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const done = part >= piece.parts.length;
  const cur = piece.parts[Math.min(part, piece.parts.length - 1)];
  const answered = !cur.question || picked !== null;
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {header}
      <ScrollView contentContainerStyle={styles.content}>
        {!done ? (
          <Card title={`Part ${part + 1} of ${piece.parts.length}`} testID="listening-part"
            headerRight={<TouchableOpacity onPress={play} accessibilityLabel={playing ? 'Stop' : 'Play'}><Icon name={playing ? 'square' : 'volume-2'} size={22} color={colors.primary} /></TouchableOpacity>}>
            {cur.lines.map((l, i) => (
              <View key={i} style={styles.line}>
                {!!l.speaker && <Text style={styles.speaker}>{l.speaker}</Text>}
                <Text style={styles.target}>{l.t}</Text>
                {english && <Text style={styles.english}>{l.en}</Text>}
              </View>
            ))}
            <TouchableOpacity onPress={() => setEnglish(!english)}><Text style={styles.link}>{english ? 'Hide English' : 'Show English'}</Text></TouchableOpacity>
            {cur.question && (
              <View style={styles.question} testID="listening-question">
                <Text style={styles.body}>{cur.question.q}</Text>
                {cur.question.options.map((o, i) => (
                  <Choice key={o} label={o} disabled={picked !== null} onPress={() => setPicked(i)}
                    state={picked === null ? null : i === cur.question!.answer ? 'right' : i === picked ? 'wrong' : null} />
                ))}
              </View>
            )}
            <Button title={part + 1 < piece.parts.length ? 'Next part' : 'See my new words'} disabled={!answered}
              onPress={() => { stop(); setPlaying(false); setPart(part + 1); setPicked(null); setEnglish(false); }} testID="listening-next" />
          </Card>
        ) : (
          <NewWords piece={piece} kind={kind} onAnother={() => { setPiece(null); setPart(0); }} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

/** The end of a story or podcast: its new words, to tick and save to My words. */
function NewWords({ piece, kind, onAnother }: { piece: Listening; kind: Listening['kind']; onAnother: () => void }) {
  const navigation = useNavigation<any>();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [keep, setKeep] = useState<Set<number>>(() => new Set(piece.vocab.map((_, i) => i)));
  const [savedCount, setSavedCount] = useState<number | null>(null);
  const flip = (i: number) => { const n = new Set(keep); if (n.has(i)) n.delete(i); else n.add(i); setKeep(n); };
  return (
          <Card title="New words for you" subtitle="Words from this piece you have not learned yet. Tick the ones to practise." testID="listening-vocab">
            {piece.vocab.map((v, i) => (
              <TouchableOpacity key={v.t} style={styles.word} onPress={() => flip(i)}>
                <Icon name={keep.has(i) ? 'check-square' : 'square'} size={18} color={colors.primary} />
                <Text style={styles.target}>{v.t}</Text>
                <Text style={styles.english}>{v.en}</Text>
              </TouchableOpacity>
            ))}
            {!piece.vocab.length && <Text style={styles.body}>No new words this time: you know them all.</Text>}
            {savedCount === null ? (
              <Button title="Add to My words" disabled={!keep.size} testID="listening-save"
                onPress={() => setSavedCount(languageService.saveWords(piece.vocab.filter((_, i) => keep.has(i))))} />
            ) : (
              <>
                <Text style={styles.body}>{savedCount} new word{savedCount === 1 ? '' : 's'} added to My words.</Text>
                {languageService.unlocked(MY_WORDS) && <Button title="Practise My words" onPress={() => navigation.navigate('Lesson', { unitId: MY_WORDS })} />}
              </>
            )}
            <Button title={kind === 'story' ? 'Another story' : 'Another podcast'} variant="outline" onPress={onAnother} />
          </Card>
  );
}
