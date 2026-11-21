/**
 * Review what a practice session proposes to keep. Each lesson and each checked answer has a switch; "Keep selected" passes only what is switched
 * on to the agent, "Throw it all away" discards the proposal. Nothing is kept without the person's say-so: the Judge that checked the answers is
 * often the same small model that wrote them.
 */
import React, { useEffect, useState } from 'react';
import { Modal, ScrollView, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useThemedStyles } from '../theme';
import type { ThemeColors } from '../theme';
import { SPACING, TYPOGRAPHY } from '../constants';
import type { SessionProposal } from '../learning/engine';

interface Props {
  visible: boolean;
  proposal: SessionProposal;
  /** True when the agent has a project: only then can answers be saved. */
  canSaveAnswers: boolean;
  onKeep: (approved: { lessons: string[]; answers: number[] }) => void;
  onDiscard: () => void;
  onClose: () => void;
}

export const SessionReviewSheet: React.FC<Props> = ({ visible, proposal, canSaveAnswers, onKeep, onDiscard, onClose }) => {
  const styles = useThemedStyles(createStyles);
  const [lessons, setLessons] = useState<Set<string>>(new Set());
  const [answers, setAnswers] = useState<Set<number>>(new Set());
  // Nothing is switched on to begin with: keeping is a choice, not a default.
  useEffect(() => { if (visible) { setLessons(new Set()); setAnswers(new Set()); } }, [visible]);
  const toggle = <T,>(set: Set<T>, value: T, put: (s: Set<T>) => void) => { const next = new Set(set); if (next.has(value)) next.delete(value); else next.add(value); put(next); };
  const chosen = lessons.size + answers.size;

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet} testID="session-review">
          <Text style={styles.title}>Keep what it learned</Text>
          <Text style={styles.note}>Switch on what you want the agent to keep. Nothing is kept unless you choose it, because the checking was done by a model.</Text>
          <ScrollView style={styles.list}>
            {proposal.lessons.length > 0 && <Text style={styles.heading}>Lessons</Text>}
            {proposal.lessons.map((lesson, i) => (
              <View key={`l${i}`} style={styles.row}>
                <Text style={styles.text}>{lesson}</Text>
                <Switch testID={`review-lesson-${i}`} value={lessons.has(lesson)} onValueChange={() => toggle(lessons, lesson, setLessons)} />
              </View>
            ))}
            {proposal.answers.length > 0 && <Text style={styles.heading}>Checked answers</Text>}
            {proposal.answers.length > 0 && !canSaveAnswers && <Text style={styles.note}>Answers are saved in a project's knowledge base. Give this agent a project to keep them.</Text>}
            {proposal.answers.map((a) => (
              <View key={`a${a.index}`} style={styles.row}>
                <Text style={styles.text}>{a.q}{'\n'}{a.answer}</Text>
                <Switch testID={`review-answer-${a.index}`} value={answers.has(a.index)} onValueChange={() => toggle(answers, a.index, setAnswers)} />
              </View>
            ))}
          </ScrollView>
          <View style={styles.buttons}>
            <TouchableOpacity accessibilityRole="button" testID="review-keep" disabled={!chosen} style={[styles.button, !chosen && styles.disabled]}
              onPress={() => onKeep({ lessons: [...lessons], answers: [...answers] })}>
              <Text style={styles.buttonText}>{chosen ? `Keep ${chosen} selected` : 'Keep selected'}</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" testID="review-discard" style={styles.button} onPress={onDiscard}><Text style={styles.buttonText}>Throw it all away</Text></TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" testID="review-close" style={styles.button} onPress={onClose}><Text style={styles.buttonText}>Not now</Text></TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const createStyles = (colors: ThemeColors) => ({
  backdrop: { flex: 1, justifyContent: 'flex-end' as const, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { maxHeight: '85%' as const, backgroundColor: colors.surface, borderTopLeftRadius: SPACING.lg, borderTopRightRadius: SPACING.lg, padding: SPACING.lg },
  title: { ...TYPOGRAPHY.h2, color: colors.text, marginBottom: SPACING.xs },
  note: { ...TYPOGRAPHY.meta, color: colors.textMuted, marginBottom: SPACING.sm },
  heading: { ...TYPOGRAPHY.bodySmall, color: colors.text, marginTop: SPACING.md, marginBottom: SPACING.xs },
  list: { flexGrow: 0 },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingVertical: SPACING.sm, gap: SPACING.md },
  text: { ...TYPOGRAPHY.bodySmall, color: colors.text, flex: 1 },
  buttons: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: SPACING.sm, marginTop: SPACING.md },
  button: { borderWidth: 1, borderColor: colors.border, borderRadius: SPACING.sm, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  disabled: { opacity: 0.4 },
  buttonText: { ...TYPOGRAPHY.bodySmall, color: colors.text },
});
