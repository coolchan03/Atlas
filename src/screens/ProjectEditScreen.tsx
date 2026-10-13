import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  KeyboardAvoidingView,
  Platform,
  InteractionManager,
  Alert, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AttachStep, useSpotlightTour } from 'react-native-spotlight-tour';
import { CustomAlert, showAlert, hideAlert, AlertState, initialAlertState } from '../components/CustomAlert';
import { consumePendingSpotlight } from '../components/onboarding/spotlightState';
import { useTheme, useThemedStyles } from '../theme';
import type { ThemeColors, ThemeShadows } from '../theme';
import { TYPOGRAPHY, SPACING } from '../constants';
import { useProjectStore } from '../stores';
import { RootStackParamList } from '../navigation/types';
import { ProjectPinGate } from '../components/ProjectPinGate';
import { protectProject, permanentlyUnprotectProject } from '../stores/protectedProjectStorage';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'ProjectEdit'>;
type RouteProps = RouteProp<RootStackParamList, 'ProjectEdit'>;

export const ProjectEditScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const projectId = route.params?.projectId;
  const [alertState, setAlertState] = useState<AlertState>(initialAlertState);
  const [protectAction, setProtectAction] = useState<'protect' | 'unprotect' | null>(null);
  const [protectPin, setProtectPin] = useState('');
  const [protectBusy, setProtectBusy] = useState(false);
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  const { goTo } = useSpotlightTour();
  const { getProject, createProject, updateProject } = useProjectStore();
  const existingProject = projectId ? getProject(projectId) : null;

  // If user arrived here via onboarding spotlight flow, show name input spotlight
  useEffect(() => {
    const pending = consumePendingSpotlight();
    if (pending !== null) {
      const task = InteractionManager.runAfterInteractions(() => goTo(pending));
      return () => task.cancel();
    }
  }, []);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    systemPrompt: '',
    allowLearningActivities: false,
  });

  useEffect(() => {
    if (existingProject) {
      setFormData({
        name: existingProject.name,
        description: existingProject.description,
        systemPrompt: existingProject.systemPrompt,
        allowLearningActivities: existingProject.allowLearningActivities ?? Boolean(existingProject.allowGames || existingProject.allowQuizzes || existingProject.allowPodcasts),
      });
    }
  }, [existingProject]);

  const applyProjectProtection = async () => {
    if (!existingProject || !protectAction || protectBusy) return;
    if (!/^[0-9]{4,12}$/.test(protectPin)) { Alert.alert('PIN', 'Enter 4–12 digits.'); return; }
    setProtectBusy(true);
    try {
      if (protectAction === 'protect') await protectProject(existingProject.id, protectPin);
      else await permanentlyUnprotectProject(existingProject.id, protectPin);
      setProtectPin(''); setProtectAction(null);
    } catch (e: any) { Alert.alert('Project protection', String(e?.message || e)); }
    finally { setProtectBusy(false); }
  };

  const handleSave = () => {
    if (!formData.name.trim()) {
      setAlertState(showAlert('Error', 'Please enter a name for the project'));
      return;
    }

    if (existingProject) {
      updateProject(existingProject.id, {
        name: formData.name.trim(),
        description: formData.description.trim(),
        systemPrompt: formData.systemPrompt.trim(),
        allowLearningActivities: formData.allowLearningActivities,
      });
    } else {
      createProject({
        name: formData.name.trim(),
        description: formData.description.trim(),
        systemPrompt: formData.systemPrompt.trim(),
        allowLearningActivities: formData.allowLearningActivities,
      });
    }

    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoid}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {existingProject ? 'Edit Project' : 'New Project'}
          </Text>
          <TouchableOpacity onPress={handleSave} style={styles.headerButton}>
            <Text style={styles.saveText}>Save</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          keyboardShouldPersistTaps="handled"
        >
          {/* Name */}
          <Text style={styles.label}>Name *</Text>
          <AttachStep index={8} fill>
            <TextInput
              style={styles.input}
              value={formData.name}
              onChangeText={(text) => setFormData({ ...formData, name: text })}
              placeholder="e.g., Spanish Learning, Code Review"
              placeholderTextColor={colors.textMuted}
            />
          </AttachStep>

          {/* Description */}
          <Text style={styles.label}>Description</Text>
          <TextInput
            style={styles.input}
            value={formData.description}
            onChangeText={(text) => setFormData({ ...formData, description: text })}
            placeholder="Brief description of this project"
            placeholderTextColor={colors.textMuted}
          />

          {/* System Prompt */}
          <Text style={styles.label}>Project notes (optional)</Text>
          <Text style={styles.hint}>
            Extra context for chats in this project. It is added under the active agent's instructions. Who answers and how is set in Agents.
          </Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={formData.systemPrompt}
            onChangeText={(text) => setFormData({ ...formData, systemPrompt: text })}
            placeholder="Enter the instructions or context for the AI..."
            placeholderTextColor={colors.textMuted}
            multiline
            textAlignVertical="top"
          />

          <Text style={styles.tip}>
            Tip: Be specific about what you want the AI to do, how it should respond, and any context it needs.
          </Text>

          <Text style={styles.label}>Learning activities</Text>
          <Text style={styles.hint}>Allow Atlas to suggest learning games, quizzes or podcasts based on this project's material. Off by default; unrelated offline arcade games stay in Emergency/Offline tools.</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 }}>
            <Text style={[styles.label, { flex: 1, marginBottom: 0 }]}>Allow project-based learning activities</Text>
            <Switch value={formData.allowLearningActivities} onValueChange={value => setFormData(current => ({ ...current, allowLearningActivities: value }))} />
          </View>

          {existingProject && <View style={{ marginTop: 20, gap: 8 }}>
            <Text style={styles.label}>Project encryption</Text>
            <Text style={styles.hint}>Opt-in only. Protects this project's settings and notes with its own Android Keystore key. Projects with documents, chats or saved study outputs cannot yet be protected because those sources are stored separately.</Text>
            <TouchableOpacity onPress={() => { setProtectAction(existingProject.pinVerifier ? 'unprotect' : 'protect'); setProtectPin(''); }} style={{ padding: 13, borderRadius: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ color: colors.text, fontWeight: '600' }}>{existingProject.pinVerifier ? 'Permanently remove project protection' : 'Encrypt project settings with a PIN'}</Text>
            </TouchableOpacity>
          </View>}

          <View style={styles.bottomPadding} />
        </ScrollView>
      </KeyboardAvoidingView>
      {!!projectId && <ProjectPinGate projectId={projectId} />}
      <Modal visible={protectAction !== null} animationType="fade" transparent onRequestClose={() => setProtectAction(null)}>
        <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 20, gap: 14 }}>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>{protectAction === 'protect' ? 'Protect project settings' : 'Permanently unprotect project'}</Text>
            <Text style={{ color: colors.textSecondary }}>{protectAction === 'protect' ? 'Choose a PIN; the same PIN may be used for other projects or chats.' : 'Enter the current PIN to decrypt and save these project settings normally.'}</Text>
            <TextInput value={protectPin} onChangeText={v => setProtectPin(v.replace(/\D/g,'').slice(0,12))} secureTextEntry keyboardType="number-pad" placeholder="4–12 digits" placeholderTextColor={colors.textMuted} style={{ borderWidth: 1, borderColor: colors.border, padding: 12, borderRadius: 8, color: colors.text }} />
            <TouchableOpacity disabled={protectBusy} onPress={applyProjectProtection} style={{ padding: 13, borderRadius: 9, backgroundColor: colors.primary }}><Text style={{ color: '#fff', textAlign: 'center' }}>{protectBusy ? 'Working…' : 'Confirm'}</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => { setProtectAction(null); setProtectPin(''); }}><Text style={{ color: colors.text, textAlign: 'center' }}>Cancel</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
      <CustomAlert {...alertState} onClose={() => setAlertState(hideAlert())} />
    </SafeAreaView>
  );
};

const createStyles = (colors: ThemeColors, shadows: ThemeShadows) => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardAvoid: {
    flex: 1,
  },
  header: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
    ...shadows.small,
    zIndex: 1,
  },
  headerButton: {
    padding: SPACING.xs,
  },
  cancelText: {
    ...TYPOGRAPHY.body,
    color: colors.textMuted,
  },
  headerTitle: {
    ...TYPOGRAPHY.h2,
    fontWeight: '400' as const,
  },
  saveText: {
    ...TYPOGRAPHY.body,
    color: colors.primary,
    fontWeight: '400' as const,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: SPACING.lg,
    paddingBottom: 100,
  },
  label: {
    ...TYPOGRAPHY.label,
    color: colors.text,
    marginBottom: SPACING.sm,
    marginTop: SPACING.lg,
    textTransform: 'uppercase' as const,
  },
  hint: {
    ...TYPOGRAPHY.bodySmall,
    color: colors.textSecondary,
    marginBottom: SPACING.sm,
  },
  input: {
    ...TYPOGRAPHY.body,
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: SPACING.md,
    color: colors.text,
  },
  textArea: {
    minHeight: 180,
    maxHeight: 280,
    textAlignVertical: 'top' as const,
  },
  tip: {
    ...TYPOGRAPHY.bodySmall,
    color: colors.textSecondary,
    marginTop: SPACING.md,
    lineHeight: 18,
  },
  bottomPadding: {
    height: SPACING.xxl,
  },
});
