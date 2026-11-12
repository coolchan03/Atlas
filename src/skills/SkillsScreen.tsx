import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../theme';
import { SPACING, TYPOGRAPHY } from '../constants';
import { Button } from '../components/Button';
import { ScreenHeader } from '../components/ScreenHeader';
import { parseSkill, type ParsedSkill } from './parseSkill';
import { useSkills, type Skill as InstalledSkill } from './skillsStore';
import { pickSkill } from './importSkill';
import { SKILL_LIBRARY } from './library';
import { OWN_CATEGORY, SKILL_CATEGORIES, categoryOf, type SkillCategory } from './skillCategories';

type Colors = ReturnType<typeof useTheme>['colors'];

/** One skill: on/off when it is added, an Add button when it is only offered. Tap the name to read it. */
function SkillRow({ skill, installed, colors, onAdd, onRemove }: { skill: ParsedSkill; installed?: InstalledSkill; colors: Colors; onAdd: () => void; onRemove: () => void }) {
  const { setEnabled } = useSkills();
  const [open, setOpen] = useState(false);
  return (
    <View style={[styles.skill, { borderTopColor: colors.border }]} testID={installed ? `skill-${skill.name}` : undefined}>
      <View style={styles.row}>
        <TouchableOpacity style={styles.grow} onPress={() => setOpen((v) => !v)} accessibilityLabel={`Show ${skill.name}`}>
          <Text style={[styles.name, { color: colors.text }]}>/{skill.name}</Text>
          <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={open ? undefined : 2}>{skill.description}</Text>
        </TouchableOpacity>
        {installed
          ? <Switch value={installed.enabled} onValueChange={(on) => setEnabled(skill.name, on)} testID={`skill-switch-${skill.name}`} />
          : <TouchableOpacity onPress={onAdd} testID={`library-skill-${skill.name}`} accessibilityLabel={`Add the ${skill.name} skill`}><Text style={{ color: colors.primary }}>Add</Text></TouchableOpacity>}
      </View>
      {!!installed?.needs.length && <Text style={[styles.warn, { color: colors.error }]}>Expects {installed.needs.join(', ')}, which Atlas cannot run: only its instructions are followed.</Text>}
      {open && (
        <View>
          <Text style={[styles.instructions, { color: colors.text, borderColor: colors.border }]} selectable>{skill.body.slice(0, 3000)}{skill.body.length > 3000 ? '\n...' : ''}</Text>
          {!!installed && <TouchableOpacity onPress={onRemove} testID={`skill-remove-${skill.name}`} accessibilityLabel={`Remove ${skill.name}`}><Text style={{ color: colors.error }}>Remove this skill</Text></TouchableOpacity>}
        </View>
      )}
    </View>
  );
}

/** A group of skills with what it is for, and how many are on. Opens to show the skills. */
function CategoryCard({ category, skills, colors, onAdd, onRemove }: { category: SkillCategory; skills: InstalledSkill[]; colors: Colors; onAdd: (s: ParsedSkill) => void; onRemove: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const offered = SKILL_LIBRARY.filter((l) => category.names.includes(l.name) && !skills.some((s) => s.name === l.name));
  const on = skills.filter((s) => s.enabled).length;
  return (
    <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <TouchableOpacity style={styles.row} onPress={() => setOpen((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: open }} testID={`skill-category-${category.id}`}>
        <View style={styles.grow}>
          <Text style={[styles.title, { color: colors.text }]}>{category.title}</Text>
          <Text style={[styles.meta, { color: colors.textSecondary }]}>{category.hint}{on ? ` · ${on} on` : ''}</Text>
        </View>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textMuted} />
      </TouchableOpacity>
      {open && skills.map((s) => <SkillRow key={s.name} skill={s} installed={s} colors={colors} onAdd={() => onAdd(s)} onRemove={() => onRemove(s.name)} />)}
      {open && offered.map((l) => <SkillRow key={l.name} skill={l} colors={colors} onAdd={() => onAdd(l)} onRemove={() => onRemove(l.name)} />)}
      {open && !skills.length && !offered.length && <Text style={[styles.meta, { color: colors.textMuted }]}>Nothing here yet.</Text>}
    </View>
  );
}

/**
 * Skills: reusable instructions in the open SKILL.md format (the one Claude and OpenClaw use). A skill is added after a preview;
 * Atlas then follows it when a message clearly fits its description, or when you type /skill-name. Scripts and files next to
 * SKILL.md are not run, and a skill that depends on programs (curl, python) will only get its instructions followed.
 */
export const SkillsScreen: React.FC = () => {
  const { colors } = useTheme();
  const { skills, add, remove } = useSkills();
  const [pending, setPending] = useState<ParsedSkill | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pasted, setPasted] = useState('');
  const [adding, setAdding] = useState(false);

  const preview = (read: () => Promise<ParsedSkill | null> | ParsedSkill) => {
    setError(null);
    Promise.resolve().then(read).then((s) => { if (s) setPending(s); }).catch((e) => setError(String(e?.message || e)));
  };
  const confirmRemove = (name: string) => Alert.alert('Remove this skill?', `/${name}`, [
    { text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => remove(name) },
  ]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScreenHeader title="Skills" />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={[styles.meta, { color: colors.textSecondary }]}>
          A skill tells Atlas how to do one kind of task. Open a group, add the ones you want and switch them on. Atlas uses a skill when your message fits it, or when you start a message with /skill-name.
        </Text>
        {!skills.length && <Text style={[styles.meta, { color: colors.textMuted }]} testID="skills-empty">No skills added yet.</Text>}

        {!!pending && (
          <View style={[styles.card, { borderColor: colors.primary, backgroundColor: colors.surface }]} testID="skill-preview">
            <Text style={[styles.title, { color: colors.text }]}>Add /{pending.name}?</Text>
            <Text style={[styles.meta, { color: colors.textSecondary }]}>{pending.description}</Text>
            {!!pending.needs.length && <Text style={[styles.warn, { color: colors.error }]}>Expects {pending.needs.join(', ')}, which Atlas cannot run.</Text>}
            <Text style={[styles.instructions, { color: colors.text, borderColor: colors.border }]}>{pending.body.slice(0, 1200)}{pending.body.length > 1200 ? '\n...' : ''}</Text>
            <View style={styles.actions}>
              <Button title="Add skill" onPress={() => { add(pending); setPending(null); setPasted(''); setAdding(false); }} testID="skill-add" />
              <Button title="Cancel" variant="ghost" onPress={() => setPending(null)} testID="skill-cancel" />
            </View>
          </View>
        )}
        {!!error && <Text style={[styles.warn, { color: colors.error }]} testID="skill-error">{error}</Text>}

        {[...SKILL_CATEGORIES, OWN_CATEGORY].map((category) => {
          const mine = skills.filter((s) => categoryOf(s.name).id === category.id);
          if (category.id === OWN_CATEGORY.id && !mine.length) return null;
          return <CategoryCard key={category.id} category={category} skills={mine} colors={colors} onAdd={add} onRemove={confirmRemove} />;
        })}

        <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <TouchableOpacity style={styles.row} onPress={() => setAdding((v) => !v)} accessibilityRole="button" testID="skill-add-own">
            <View style={styles.grow}>
              <Text style={[styles.title, { color: colors.text }]}>Add your own skill</Text>
              <Text style={[styles.meta, { color: colors.textSecondary }]}>From a SKILL.md file or pasted text. Only add skills you trust: their text steers the AI.</Text>
            </View>
            <Icon name={adding ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textMuted} />
          </TouchableOpacity>
          {adding && (
            <View style={styles.form}>
              <Button title="Choose a SKILL.md or zip" onPress={() => preview(pickSkill)} testID="skill-choose" />
              <Text style={[styles.meta, { color: colors.textMuted }]}>Or paste the text of a SKILL.md:</Text>
              <TextInput value={pasted} onChangeText={setPasted} multiline placeholder={'---\nname: my-skill\ndescription: When to use it\n---\nWhat to do...'} placeholderTextColor={colors.textMuted}
                style={[styles.input, { color: colors.text, borderColor: colors.border }]} testID="skill-paste" autoCapitalize="none" />
              <Button title="Preview" variant="outline" disabled={!pasted.trim()} onPress={() => preview(() => parseSkill(pasted))} testID="skill-preview-button" />
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: 60 },
  meta: { ...TYPOGRAPHY.bodySmall },
  title: { ...TYPOGRAPHY.h3 },
  name: { ...TYPOGRAPHY.body },
  card: { borderWidth: 1, borderRadius: 12, padding: SPACING.md, gap: SPACING.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  grow: { flex: 1 },
  skill: { borderTopWidth: 1, paddingTop: SPACING.sm, gap: SPACING.sm },
  warn: { ...TYPOGRAPHY.bodySmall, fontSize: 12 },
  instructions: { ...TYPOGRAPHY.bodySmall, fontSize: 12, borderTopWidth: 1, paddingTop: SPACING.sm, marginVertical: SPACING.sm },
  input: { borderWidth: 1, borderRadius: 10, padding: SPACING.md, minHeight: 120, textAlignVertical: 'top', fontSize: 13 },
  actions: { flexDirection: 'row', gap: SPACING.sm },
  form: { gap: SPACING.md },
});
