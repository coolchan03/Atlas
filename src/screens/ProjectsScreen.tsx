import React, { useState } from 'react';
import { useWideLayout } from '../hooks/useWideLayout';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Platform, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, CompositeNavigationProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import Icon from 'react-native-vector-icons/Feather';
import { AttachStep } from 'react-native-spotlight-tour';
import { Button } from '../components/Button';
import { CustomAlert, showAlert, hideAlert, AlertState, initialAlertState } from '../components/CustomAlert';
import { AnimatedEntry } from '../components/AnimatedEntry';
import { AnimatedListItem } from '../components/AnimatedListItem';
import { useFocusTrigger } from '../hooks/useFocusTrigger';
import { useTheme, useThemedStyles } from '../theme';
import type { ThemeColors, ThemeShadows } from '../theme';
import { TYPOGRAPHY, SPACING } from '../constants';
import { useProjectStore, useChatStore } from '../stores';
import { Project } from '../types';
import { listRows, type Row } from '../stores/projectTree';
import { RootStackParamList, MainTabParamList } from '../navigation/types';

type NavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'ProjectsTab'>,
  NativeStackNavigationProp<RootStackParamList>
>;

export const ProjectsScreen: React.FC<{ embedded?: boolean }> = ({ embedded = false }) => {
  const navigation = useNavigation<NavigationProp>();
  const focusTrigger = useFocusTrigger();
  const { colors } = useTheme();
  const wide = useWideLayout();
  const styles = useThemedStyles(createStyles);
  const { projects: everyProject, deleteProject, updateProject } = useProjectStore();
  // Learn a language has its own tab and screen: its chats are reached from there.
  const projects = everyProject.filter((p) => p.course !== 'language');
  const { conversations } = useChatStore();
  const [alertState, setAlertState] = useState<AlertState>(initialAlertState);
  // Folders (projects with projects inside) open and close with a tap, and show what is inside them.
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());
  const toggleFolder = (id: string) => setOpenFolders((s) => { const next = new Set(s); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  // Get chat count for a project
  const getChatCount = (projectId: string) => {
    return conversations.filter((c) => c.projectId === projectId).length;
  };

  const handleProjectPress = (project: Project) => {
    navigation.navigate('ProjectDetail', { projectId: project.id });
  };

  const handleDeleteProject = (project: Project) => {
    setAlertState(showAlert(
      'Delete Project',
      `Delete "${project.name}"? This will not delete the chats associated with this project.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setAlertState(hideAlert());
            deleteProject(project.id);
          },
        },
      ]
    ));
  };

  const renderRightActions = (project: Project) => (
    <TouchableOpacity
      style={styles.deleteAction}
      onPress={() => handleDeleteProject(project)}
    >
      <Icon name="trash-2" size={16} color={colors.error} />
    </TouchableOpacity>
  );

  const handleNewProject = () => {
    navigation.navigate('ProjectEdit', {});
  };

  const renderProject = ({ item: row, index }: { item: Row<Project>; index: number }) => {
    const item = row.project;
    const chatCount = getChatCount(item.id);
    const inside = projects.filter((p) => p.parentId === item.id).length;

    return (
      <Swipeable
        renderRightActions={() => renderRightActions(item)}
        overshootRight={false}
        containerStyle={styles.swipeableContainer}
      >
        <AnimatedListItem
          index={index}
          trigger={focusTrigger}
          style={[styles.projectItem, { marginLeft: row.depth * SPACING.lg }]}
          onPress={() => (row.folder ? toggleFolder(item.id) : handleProjectPress(item))}
          testID={`project-row-${item.id}`}
        >
          <View style={styles.projectIcon}>
            <Text style={styles.projectIconText}>
              {item.pinVerifier ? 'L' : row.folder ? '' : item.name.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.projectContent}>
            <View style={styles.projectNameRow}>
              <Text style={styles.projectName} numberOfLines={1}>{item.pinVerifier ? 'Locked project' : item.name}</Text>
              {row.folder && <Icon name={row.open ? 'folder-minus' : 'folder-plus'} size={12} color={colors.textMuted} />}
              {!item.pinVerifier && (
                <View style={styles.chatCountTag}>
                  <Icon name="message-circle" size={8} color={colors.textMuted} />
                  <Text style={styles.chatCountText}>{chatCount}</Text>
                </View>
              )}
            </View>
            {item.description && !item.pinVerifier ? (
              <Text style={styles.projectDescription} numberOfLines={1}>
                {item.description}
              </Text>
            ) : null}
          </View>
          <TouchableOpacity accessibilityLabel={item.isPinned ? 'Unpin project' : 'Pin project'}
            testID={`pin-project-${  item.id}`} style={staticStyles.h1}
            onPress={() => {
              try { updateProject(item.id, { isPinned: !item.isPinned }); }
              catch (error: any) { setAlertState(showAlert('Cannot pin project', String(error?.message || error))); }
            }}>
            <Icon name="star" size={16} color={item.isPinned ? colors.primary : colors.textMuted} />
          </TouchableOpacity>
          {row.folder ? (
            <TouchableOpacity onPress={() => handleProjectPress(item)} hitSlop={10} accessibilityLabel={`Open ${item.name} itself (${inside} inside)`} testID={`open-folder-${item.id}`}>
              <Icon name="chevron-right" size={14} color={colors.textMuted} />
            </TouchableOpacity>
          ) : <Icon name="chevron-right" size={14} color={colors.textMuted} />}
        </AnimatedListItem>
      </Swipeable>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={embedded ? [] : ['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Projects</Text>
        <AttachStep index={7}>
          <Button
            title="New"
            variant="primary"
            size="small"
            onPress={handleNewProject}
            icon={<Icon name="plus" size={16} color={colors.primary} />}
          />
        </AttachStep>
      </View>

      <Text style={styles.subtitle}>
        Projects group related chats with shared context and instructions.
      </Text>

      {projects.length === 0 ? (
        <View style={styles.emptyState}>
          <AnimatedEntry index={0} staggerMs={60} trigger={focusTrigger}>
            <View style={styles.emptyIcon}>
              <Icon name="folder" size={20} color={colors.textMuted} />
            </View>
          </AnimatedEntry>
          <AnimatedEntry index={1} staggerMs={60} trigger={focusTrigger}>
            <Text style={styles.emptyTitle}>No Projects Yet</Text>
          </AnimatedEntry>
          <AnimatedEntry index={2} staggerMs={60} trigger={focusTrigger}>
            <Text style={styles.emptyText}>
              Create a project to organize your chats by topic, like "Spanish Learning" or "Code Review".
            </Text>
          </AnimatedEntry>
          <AnimatedEntry index={3} staggerMs={60} trigger={focusTrigger}>
            <TouchableOpacity style={styles.emptyButton} onPress={handleNewProject}>
              <Icon name="plus" size={14} color={colors.primary} />
              <Text style={styles.emptyButtonText}>Create Project</Text>
            </TouchableOpacity>
          </AnimatedEntry>
        </View>
      ) : (
        <FlatList
          data={listRows(projects, openFolders, (a, b) => Number(!!b.isPinned) - Number(!!a.isPinned) || b.updatedAt.localeCompare(a.updatedAt))}
          renderItem={renderProject}
          keyExtractor={(row) => row.project.id}
          extraData={openFolders}
          contentContainerStyle={[styles.list, wide.column]}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={Platform.OS !== 'android'}
        />
      )}
      <CustomAlert {...alertState} onClose={() => setAlertState(hideAlert())} />
    </SafeAreaView>
  );
};

const createStyles = (colors: ThemeColors, shadows: ThemeShadows) => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  swipeableContainer: {
    overflow: 'visible' as const,
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
  title: {
    ...TYPOGRAPHY.h2,
    color: colors.text,
  },
  subtitle: {
    ...TYPOGRAPHY.bodySmall,
    color: colors.textSecondary,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  list: {
    padding: SPACING.lg,
    paddingTop: SPACING.lg,
  },
  projectItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: colors.surface,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    borderRadius: 10,
    marginBottom: SPACING.md,
    ...shadows.small,
  },
  projectIcon: {
    width: 24,
    height: 24,
    borderRadius: 4,
    backgroundColor: colors.surfaceLight,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginRight: SPACING.sm,
  },
  projectIconText: {
    ...TYPOGRAPHY.meta,
    color: colors.textMuted,
  },
  projectContent: {
    flex: 1,
  },
  projectNameRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  projectName: {
    ...TYPOGRAPHY.bodySmall,
    color: colors.text,
    fontWeight: '400' as const,
    flexShrink: 1,
  },
  projectDescription: {
    ...TYPOGRAPHY.meta,
    color: colors.textSecondary,
    marginTop: 1,
  },
  chatCountTag: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 3,
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: SPACING.sm,
    flexShrink: 0,
  },
  chatCountText: {
    ...TYPOGRAPHY.metaSmall,
    color: colors.textMuted,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    paddingHorizontal: SPACING.xxl,
  },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: SPACING.lg,
  },
  emptyTitle: {
    ...TYPOGRAPHY.h2,
    color: colors.text,
    fontWeight: '400' as const,
    marginBottom: SPACING.sm,
  },
  emptyText: {
    ...TYPOGRAPHY.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center' as const,
    lineHeight: 18,
    marginBottom: SPACING.xl,
  },
  emptyButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.primary,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderRadius: 6,
    gap: SPACING.sm,
  },
  emptyButtonText: {
    ...TYPOGRAPHY.body,
    color: colors.primary,
    fontWeight: '400' as const,
  },
  deleteAction: {
    backgroundColor: colors.errorBackground,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    width: 50,
    borderRadius: 12,
    marginBottom: 16,
    marginLeft: 10,
  },
});

const staticStyles = StyleSheet.create({
  h1: { padding: 10 },
});
