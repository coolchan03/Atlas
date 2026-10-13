/* eslint-disable react-native/no-inline-styles -- Small workspace segment control computes active colors from theme. */
import React, { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { ProjectsScreen } from './ProjectsScreen';
import { AgentsScreen } from './AgentsScreen';

type WorkspaceSection = 'projects' | 'agents';

/** One bottom-tab destination for both projects and agent personas. */
export const WorkspaceScreen: React.FC = () => {
  const [section, setSection] = useState<WorkspaceSection>('projects');
  const { colors } = useTheme();
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ flexDirection: 'row', paddingHorizontal: 16,
        paddingTop: 8, paddingBottom: 5, gap: 8, backgroundColor: colors.background }}>
        {(['projects', 'agents'] as const).map(key => (
          <TouchableOpacity key={key} testID={`workspace-${  key}`}
            accessibilityRole="tab" accessibilityState={{ selected: section === key }}
            onPress={() => setSection(key)}
            style={{
              flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 10,
              backgroundColor: section === key ? colors.primary : colors.surface,
              borderWidth: 1, borderColor: section === key ? colors.primary : colors.border,
            }}>
            <Text style={{ fontWeight: '600', color: section === key ? colors.background : colors.text }}>
              {key === 'projects' ? 'Projects' : 'Agents'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={{ flex: 1 }}>
        {section === 'projects' ? <ProjectsScreen embedded /> : <AgentsScreen embedded />}
      </View>
    </SafeAreaView>
  );
};
