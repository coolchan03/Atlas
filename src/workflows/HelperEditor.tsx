import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme';
import { SPACING, TYPOGRAPHY } from '../constants';
import { Button } from '../components';
import { Shell } from './WorkflowViews';
import { parseSteps, useCustomHelpers, type CustomHelper } from './customHelpers';

const EXAMPLE = 'field: Tone | Friendly, Formal\nfield: Names to include\nask: Keep it short? | Yes, No\nai: Write the reply in that tone, using the names.\nai: Check the reply for anything missing and fix it.';

/** Write your own multi-step helper: a name and one step per line. The AI can also draft the steps from a plain description. */
export const HelperEditor: React.FC<{ helper: CustomHelper | null; onClose: () => void }> = ({ helper, onClose }) => {
  const { colors } = useTheme();
  const [title, setTitle] = useState(helper?.title ?? '');
  const [summary, setSummary] = useState(helper?.summary ?? '');
  const [help, setHelp] = useState(helper?.help ?? '');
  const [steps, setSteps] = useState(helper?.steps ?? '');
  const [idea, setIdea] = useState('');
  const [busy, setBusy] = useState(false);
  const problems = steps.trim() ? parseSteps(steps).errors : [];
  const input = (value: string, set: (v: string) => void, placeholder: string, testID: string, tall = false) => (
    <TextInput style={[styles.input, tall && styles.tall, { color: colors.text, borderColor: colors.border }]} value={value} onChangeText={set} placeholder={placeholder}
      placeholderTextColor={colors.textMuted} multiline={tall} textAlignVertical={tall ? 'top' : 'center'} testID={testID} />
  );
  const draft = async () => {
    setBusy(true);
    try {
      const reply: string = await require('../study/engine').askModel(
        'You write the steps of a small multi-step helper. Reply with ONLY lines, each starting with field:, ask: or ai:. field: is a choice or typed answer asked before it starts ("field: Tone | Friendly, Formal"). ask: is a choice asked part-way ("ask: Keep it short? | Yes, No"). ai: is one instruction for the AI. Use at most 3 field lines, 1 ask line and 4 ai lines.',
        `The helper should: ${idea.slice(0, 500)}`);
      const lines = reply.split('\n').map((l) => l.trim()).filter((l) => /^(field|ask|ai)\s*:/i.test(l));
      if (!lines.length) throw new Error('The AI did not write steps in the expected form. Try again or write them yourself.');
      setSteps(lines.join('\n'));
    } catch (e) { Alert.alert('Could not draft the steps', String((e as Error)?.message || e)); } finally { setBusy(false); }
  };
  const save = () => {
    useCustomHelpers.getState().save({ id: helper?.id ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, title: title.trim(), summary: summary.trim(), help: help.trim(), steps: steps.trim() });
    onClose();
  };
  return (
    <Shell title={helper ? 'Edit helper' : 'Make your own helper'} onBack={onClose}>
      <Text style={[styles.note, { color: colors.textSecondary }]}>A helper is a name plus steps, one per line. Each line starts with field: (asked first), ask: (a choice part-way, with choices after a |) or ai: (an instruction for the AI). The last AI result is shown for your approval, then saved as a note.</Text>
      {input(title, setTitle, 'Name, for example: Reply writer', 'helper-title')}
      {input(summary, setSummary, 'One line about what it does (optional)', 'helper-summary')}
      {input(help, setHelp, 'What to paste or type when it starts (optional)', 'helper-help')}
      {input(steps, setSteps, EXAMPLE, 'helper-steps', true)}
      {problems.map((p) => <Text key={p} style={{ color: colors.error }}>{p}</Text>)}
      <Text style={[styles.note, { color: colors.textSecondary }]}>Not sure how to write the steps? Say what you want and the AI drafts them for you to edit.</Text>
      {input(idea, setIdea, 'For example: turn my rough notes into a polite email', 'helper-idea')}
      <View style={styles.row}>
        <Button title={busy ? 'Drafting...' : 'Draft the steps'} variant="outline" onPress={() => void draft()} disabled={busy || idea.trim().length < 8} testID="helper-draft" />
        <Button title="Save" onPress={save} disabled={!title.trim() || !steps.trim() || problems.length > 0} testID="helper-save" />
        {!!helper && <Button title="Delete" variant="outline" onPress={() => Alert.alert('Delete this helper?', helper.title, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => { useCustomHelpers.getState().remove(helper.id); onClose(); } }])} testID="helper-delete" />}
      </View>
    </Shell>
  );
};

const styles = StyleSheet.create({
  note: { ...TYPOGRAPHY.bodySmall },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  tall: { minHeight: 160 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
});
