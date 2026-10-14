import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../../theme';
import type { LayoutMode } from '../../theme/appearance';

type Props = { navigation: any; mode: LayoutMode };
type Destination = { label: string; hint: string; icon: string; tab?: string; screen?: string; tint: string };
const destinations: Destination[] = [
  { label: 'Chat', hint: 'Talk with your local AI', icon: 'message-circle', tab: 'ChatsTab', tint: '#DBF0FF' },
  { label: 'Projects', hint: 'Your organized work', icon: 'folder', tab: 'ProjectsTab', tint: '#E1F6E8' },
  { label: 'Models', hint: 'Choose or manage an AI', icon: 'cpu', tab: 'ModelsTab', tint: '#FFF0D4' },
  { label: 'Presentations', hint: 'Make PowerPoint slides or a PDF', icon: 'monitor', screen: 'Presentations', tint: '#EDE5FF' },
  { label: 'Settings', hint: 'Personalize Atlas', icon: 'settings', tab: 'SettingsTab', tint: '#FBE8F0' },
];

/** Simple, compact and colorful actually change the navigation experience, not just the palette. */
export const QuickHomeScreen: React.FC<Props> = ({ navigation, mode }) => {
  const { colors, isDark } = useTheme();
  const compact = mode === 'compact';
  const colorful = mode === 'colorful';
  const simple = mode === 'simple';
  const fontSize = simple ? 21 : compact ? 16 : 18;
  const padding = compact ? 10 : simple ? 22 : 17;
  const go = (item: Destination) => {
    if (item.tab) navigation.navigate(item.tab);
    else if (item.screen) navigation.getParent()?.navigate(item.screen);
  };
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <ScrollView testID={'home-' + mode} contentContainerStyle={{ padding: compact ? 12 : 22, paddingBottom: 44 }}>
        <Text style={{ color: colors.text, fontSize: simple ? 31 : compact ? 24 : 29, fontWeight: '700' }}>Atlas</Text>
        <Text style={{ color: colors.textSecondary, fontSize: simple ? 18 : 14, marginTop: 6, marginBottom: compact ? 10 : 20 }}>
          {simple ? 'What would you like to do?' : compact ? 'Quick access' : 'Choose something to explore'}
        </Text>
        <View style={{ flexDirection: compact ? 'row' : 'column', flexWrap: 'wrap', gap: compact ? 8 : 12 }}>
          {destinations.map((item, index) => (
            <TouchableOpacity key={item.label} testID={'quick-home-' + item.label.toLowerCase()}
              accessibilityRole="button" accessibilityLabel={item.label + '. ' + item.hint}
              onPress={() => go(item)} style={{
                flexDirection: compact ? 'column' : 'row', alignItems: 'center',
                flexBasis: compact ? '47%' : undefined, flexGrow: compact ? 1 : 0,
                backgroundColor: colorful && !isDark ? item.tint : colors.surface,
                borderColor: colorful ? (isDark ? colors.primaryLight : '#B8CFE4') : colors.border,
                borderWidth: 1, borderRadius: compact ? 10 : simple ? 19 : 15,
                padding, minHeight: simple ? 92 : compact ? 90 : 76, gap: compact ? 8 : 15,
              }}>
              <View style={{
                width: simple ? 46 : 36, height: simple ? 46 : 36, borderRadius: 12,
                backgroundColor: colorful ? (isDark ? colors.surfaceLight : '#FFFFFF') : colors.surfaceLight,
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon name={item.icon} size={simple ? 26 : 21} color={colors.primary} />
              </View>
              <View style={{ flex: compact ? undefined : 1, alignItems: compact ? 'center' : 'flex-start' }}>
                <Text style={{ fontSize, color: colors.text, fontWeight: '700' }}>{item.label}</Text>
                {!compact && <Text style={{ color: colors.textSecondary, fontSize: simple ? 15 : 12, marginTop: 4 }}>{item.hint}</Text>}
              </View>
              {!compact && <Icon name="chevron-right" size={simple ? 23 : 19} color={colors.textMuted} />}
            </TouchableOpacity>
          ))}
        </View>
        {colorful && <Text style={{ color: colors.textMuted, marginTop: 20, textAlign: 'center' }}>
          Your models and conversations stay on your device.
        </Text>}
      </ScrollView>
    </SafeAreaView>
  );
};
