import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useThemedStyles } from '../theme';
import type { ThemeColors, ThemeShadows } from '../theme';
import { SPACING, TYPOGRAPHY } from '../constants';
import { Button } from '../components/Button';
import { PodcastOptionsForm, DEFAULT_PODCAST, type PodcastChoices } from '../components/PodcastOptionsForm';
import { listVoices, keepScreenOn } from '../atlasVoice/tts';
import { modelSpeed, podcastContextWarning } from '../study/engine';
import { coursePodcastProject, makeCoursePodcast, writtenLessons } from './coursePodcast';
import type { Course } from './store';

/** "Make a podcast" for a course: the same options as Study mode, written from the lessons that are already on the board. */
export function CoursePodcastCard({ course }: { course: Course }) {
  const styles = useThemedStyles(createStyles);
  const navigation = useNavigation<any>();
  const [open, setOpen] = useState(false);
  const [choices, setChoices] = useState<PodcastChoices>({ ...DEFAULT_PODCAST, prompt: '' });
  const [voiceCount, setVoiceCount] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const stop = useRef(false);
  const lessons = writtenLessons(course);
  useEffect(() => { listVoices('en').then((v) => setVoiceCount(v.length)).catch(() => undefined); }, []);

  const make = async () => {
    stop.current = false;
    setOpen(false);
    setBusy('Starting...');
    keepScreenOn(true, 'course-podcast'); // a long episode: don't let the phone sleep and pause it
    try {
      const r = await makeCoursePodcast(course, { ...choices, hosts: voiceCount >= 2 ? choices.hosts : 1 }, { onStep: setBusy, shouldStop: () => stop.current });
      navigation.navigate('Study', { projectId: coursePodcastProject(course.id), openAt: r.createdAt });
    } catch (e: any) {
      Alert.alert('Could not make the podcast', String(e?.message || e));
    } finally { setBusy(null); keepScreenOn(false, 'course-podcast'); }
  };

  return (
    <View style={styles.wrap} testID="course-podcast">
      {busy ? (
        <View style={styles.busy}>
          <ActivityIndicator />
          <Text style={styles.meta} testID="course-podcast-status">{busy}</Text>
          <Button title="Stop and keep what is written" variant="outline" onPress={() => { stop.current = true; }} testID="course-podcast-stop" />
        </View>
      ) : (
        <>
          <Button title="Make a podcast from this course" variant="outline" disabled={!lessons} onPress={() => setOpen(true)} testID="course-podcast-open" />
          <Text style={styles.meta}>{lessons ? `Uses the ${lessons} ${lessons === 1 ? 'lesson' : 'lessons'} written so far.` : 'Write or play a lesson first. The podcast is made from the lessons.'}</Text>
        </>
      )}
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.title}>Podcast from {course.title}</Text>
            <ScrollView keyboardShouldPersistTaps="handled">
              {open && (
                <PodcastOptionsForm value={choices} onChange={setChoices} voiceCount={voiceCount} allowResearch={false}
                  promptPlaceholder="Optional: what to focus on, e.g. just the first unit"
                  tokensPerSecond={modelSpeed()} contextWarning={podcastContextWarning()} />
              )}
            </ScrollView>
            <View style={styles.actions}>
              <Button title="Cancel" variant="outline" onPress={() => setOpen(false)} testID="course-podcast-cancel" />
              <Button title="Make episode" onPress={make} testID="course-podcast-make" />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (colors: ThemeColors, _shadows: ThemeShadows) => ({
  wrap: { marginTop: SPACING.md, gap: SPACING.xs },
  busy: { gap: SPACING.sm },
  meta: { ...TYPOGRAPHY.meta, color: colors.textSecondary },
  backdrop: { flex: 1, justifyContent: 'flex-end' as const, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { backgroundColor: colors.surface, padding: SPACING.lg, borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '90%' as const, gap: SPACING.sm },
  title: { ...TYPOGRAPHY.h2, color: colors.text },
  actions: { flexDirection: 'row' as const, justifyContent: 'flex-end' as const, gap: SPACING.sm, marginTop: SPACING.sm },
});
