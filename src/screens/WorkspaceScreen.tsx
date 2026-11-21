import { pick } from '../utils/pick';
import React, { useState } from 'react';
import { Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { ProjectsScreen } from './ProjectsScreen';
import { AgentsScreen } from './AgentsScreen';
import { useLayoutClass } from '../hooks/useLayoutClass';

type WorkspaceSection = 'projects' | 'agents';

/** One destination for both projects and agent personas: tabs on phones, two panes on large tablets. */
export const WorkspaceScreen: React.FC = () => {
  const [section, setSection] = useState<WorkspaceSection>('projects');
  const { colors } = useTheme();
  const { twoPane } = useLayoutClass();
  if (twoPane) {
    // Large tablet: both lists stay visible side by side (each screen keeps its own header).
    return (
      <SafeAreaView edges={['top']} style={[staticStyles.h1, { backgroundColor: colors.background }]}>
        <View testID="workspace-two-pane" style={staticStyles.h2}>
          {(['projects', 'agents'] as const).map((key, index) => (
            <View key={key} testID={`workspace-pane-${key}`} style={[staticStyles.h3, { borderLeftWidth: pick(!!index, 1, 0), borderLeftColor: colors.border }]}>
              {key === 'projects' ? <ProjectsScreen embedded /> : <AgentsScreen embedded />}
            </View>
          ))}
        </View>
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView edges={['top']} style={[staticStyles.h4, { backgroundColor: colors.background }]}>
      <View style={[staticStyles.h5, { backgroundColor: colors.background }]}>
        {(['projects', 'agents'] as const).map(key => (
          <TouchableOpacity key={key} testID={`workspace-${  key}`}
            accessibilityRole="tab" accessibilityState={{ selected: section === key }}
            onPress={() => setSection(key)}
            style={[staticStyles.h6, { backgroundColor: section === key ? colors.primary : colors.surface, borderColor: section === key ? colors.primary : colors.border }]}>
            <Text style={[staticStyles.h7, { color: section === key ? colors.background : colors.text }]}>
              {key === 'projects' ? 'Projects' : 'Agents & pals'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={staticStyles.h8}>
        {section === 'projects' ? <ProjectsScreen embedded /> : <AgentsScreen embedded />}
      </View>
    </SafeAreaView>
  );
};

const staticStyles = StyleSheet.create({
  h1: { flex: 1 },
  h2: { flex: 1, flexDirection: 'row' },
  h3: { flex: 1 },
  h4: { flex: 1 },
  h5: { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 5, gap: 8 },
  h6: { flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 10, borderWidth: 1 },
  h7: { fontWeight: '600' },
  h8: { flex: 1 },
});
