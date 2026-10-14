import React, { useEffect, useMemo } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/Feather';
import { SpotlightTourProvider } from 'react-native-spotlight-tour';
import { useTheme, useThemedStyles } from '../theme';
import type { ThemeColors, ThemeShadows } from '../theme';
import { triggerHaptic } from '../utils/haptics';
import { useAppStore } from '../stores';
import { createSpotlightSteps } from '../components/onboarding/spotlightConfig';
import {
  OnboardingScreen,
  ModelDownloadScreen,
  HomeScreen,
  ModelsScreen,
  ChatScreen,
  SettingsScreen,
  ChatsListScreen,
  ProjectDetailScreen,
  ProjectEditScreen,
  AgentEditScreen,
  LearningScreen,
  EmergencyScreen,
  OfflineLibraryScreen,
  SurvivalManualScreen,
  PhrasesScreen,
  StudyScreen,
  CompassScreen,
  MapsScreen,
  AtlasHubScreen,
  MyModelsScreen,
  ModelTestScreen,
  DailyBriefScreen,
  ProjectChatsScreen,
  KnowledgeBaseScreen,
  DocumentPreviewScreen,
  DownloadManagerScreen,
  ModelSettingsScreen,
  DeviceInfoScreen,
  StorageSettingsScreen,
  SecuritySettingsScreen,
  AppearanceScreen,
  GalleryScreen,
  RemoteServersScreen,
  ProDetailScreen,
  AboutScreen,
  ToolsScreen,
} from '../screens';
import {
  RootStackParamList,
  MainTabParamList,
} from './types';
import { WorkspaceScreen } from '../screens/WorkspaceScreen';
import { useRegisteredScreens } from './screenRegistry';
import { NAV_ITEMS, resolveNavBar, type NavItemId } from './navBar';

const RootStack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

// Animated tab icon with scale spring on focus. Icons come from the bottom-bar registry.
const TAB_ICON_MAP: Record<string, string> = Object.fromEntries(NAV_ITEMS.map((i) => [i.route, i.icon]));

const TabBarIcon: React.FC<{ name: string; focused: boolean }> = ({ name, focused }) => {
  const { colors } = useTheme();
  const tabStyles = useThemedStyles(createTabBarStyles);
  const scale = useSharedValue(focused ? 1.1 : 1);

  useEffect(() => {
    scale.value = withSpring(focused ? 1.1 : 1, { damping: 15, stiffness: 150 });

  }, [focused]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <View style={tabStyles.iconContainer}>
      <Animated.View style={animatedStyle}>
        <Icon
          name={TAB_ICON_MAP[name] || 'circle'}
          size={22}
          color={focused ? colors.primary : colors.textMuted}
        />
      </Animated.View>
      {focused && <View style={tabStyles.focusDot} />}
    </View>
  );
};

const createTabBarStyles = (colors: ThemeColors, _shadows: ThemeShadows) => ({
  iconContainer: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  focusDot: {
    position: 'absolute' as const,
    top: -6,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
});

const mainTabsStyles = StyleSheet.create({
  container: { flex: 1 },
});

// Shortcut tabs open a full-screen destination; their own page is never shown.
const EmptyTabPage: React.FC = () => null;

const TAB_PAGES: Partial<Record<NavItemId, React.ComponentType<any>>> = {
  home: HomeScreen, chats: ChatsListScreen, workspace: WorkspaceScreen, models: ModelsScreen, settings: SettingsScreen,
};
const TAB_TEST_IDS: Record<string, string> = {
  HomeTab: 'home-tab', ChatsTab: 'chats-tab', ProjectsTab: 'projects-tab', ModelsTab: 'models-tab', SettingsTab: 'settings-tab',
};

// Main Tab Navigator
const MainTabs: React.FC = () => {
  const { colors, shadows } = useTheme();
  const insets = useSafeAreaInsets();
  const navBar = useAppStore((s) => s.settings?.navBar);
  const { order, visible, labels } = useMemo(() => resolveNavBar(navBar), [navBar]);
  const bottomInset = Math.max(insets.bottom, 20);
  const tabBarHeight = (labels ? 60 : 48) + bottomInset;

  return (
    <View style={mainTabsStyles.container}>
      <Tab.Navigator
        // Start on the first shown tab that is a real page (a shortcut has no page of its own).
        initialRouteName={(NAV_ITEMS.find((i) => visible.includes(i.id) && TAB_PAGES[i.id]) ?? NAV_ITEMS[0]).route as keyof MainTabParamList}
        backBehavior="history"
        screenOptions={({ route }) => ({
          headerShown: false,
          animation: 'fade',
          lazy: true,
          tabBarShowLabel: labels,
          tabBarStyle: {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            borderTopWidth: 1,
            height: tabBarHeight,
            paddingBottom: bottomInset,
            paddingTop: 10,
            ...shadows.medium,
          },
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarIcon: ({ focused }) => (
            <TabBarIcon name={route.name} focused={focused} />
          ),
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: '500' as const,
          },
        })}
      >
        {/* Every destination stays a registered route so navigate('ModelsTab') works when it is off the bar. */}
        {order.map((id) => {
          const item = NAV_ITEMS.find((i) => i.id === id)!;
          const shown = visible.includes(id);
          return (
            <Tab.Screen
              key={item.route}
              name={item.route as keyof MainTabParamList}
              component={TAB_PAGES[id] ?? EmptyTabPage}
              options={{
                tabBarLabel: item.label,
                tabBarButtonTestID: TAB_TEST_IDS[item.route] ?? `${id}-tab`,
                ...(shown ? {} : { tabBarButton: () => null, tabBarItemStyle: { display: 'none' as const } }),
              }}
              listeners={({ navigation }) => ({
                tabPress: (e: { preventDefault: () => void }) => {
                  triggerHaptic('selection');
                  if (item.target) {
                    e.preventDefault();
                    (navigation.getParent() as any)?.navigate(item.target);
                  }
                },
              })}
            />
          );
        })}
      </Tab.Navigator>
    </View >
  );
};

// Root Navigator — SpotlightTourProvider wraps entire stack so all screens
// (both tab screens and RootStack screens) can use useSpotlightTour()
export const AppNavigator: React.FC = () => {
  const { colors, isDark } = useTheme();
  const hasCompletedOnboarding = useAppStore((s) => s.hasCompletedOnboarding);
  const downloadedModels = useAppStore((s) => s.downloadedModels);
  const steps = useMemo(() => createSpotlightSteps(), []);
  // Reactive: screens registered at runtime (Pro activation re-runs loadProFeatures)
  // mount as real routes live, so navigate('McpServers') works without an app restart.
  const registeredScreens = useRegisteredScreens();

  // Determine initial route
  let initialRoute: keyof RootStackParamList = 'Onboarding';
  if (hasCompletedOnboarding) {
    initialRoute = downloadedModels.length > 0 ? 'Main' : 'ModelDownload';
  }

  return (
    <SpotlightTourProvider
      steps={steps}
      overlayColor="black"
      overlayOpacity={isDark ? 0.78 : 0.62}
      onBackdropPress="stop"
      motion="fade"
      shape={{ type: 'rectangle', padding: 8 }}
    >
      <RootStack.Navigator
        initialRouteName={initialRoute}
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: 'slide_from_right',
        }}
      >
        <RootStack.Screen name="Onboarding" component={OnboardingScreen} />
        <RootStack.Screen name="ModelDownload" component={ModelDownloadScreen} />
        <RootStack.Screen name="Main" component={MainTabs} />
        <RootStack.Screen name="Chat" component={ChatScreen} />
        <RootStack.Screen name="ProjectDetail" component={ProjectDetailScreen} />
        <RootStack.Screen name="ProjectChats" component={ProjectChatsScreen} />
        <RootStack.Screen
          name="ProjectEdit"
          component={ProjectEditScreen}
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <RootStack.Screen
          name="AgentEdit"
          component={AgentEditScreen}
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <RootStack.Screen name="Learning" component={LearningScreen} />
        <RootStack.Screen name="Emergency" component={EmergencyScreen} />
        <RootStack.Screen name="OfflineLibrary" component={OfflineLibraryScreen} />
        <RootStack.Screen name="SurvivalManual" component={SurvivalManualScreen} />
        <RootStack.Screen name="Phrases" component={PhrasesScreen} />
        <RootStack.Screen name="Study" component={StudyScreen} />
        <RootStack.Screen name="Compass" component={CompassScreen} />
        <RootStack.Screen name="Maps" component={MapsScreen} />
        <RootStack.Screen name="AtlasHub" component={AtlasHubScreen} />
        <RootStack.Screen name="MyModels" component={MyModelsScreen} />
        <RootStack.Screen name="ModelTest" component={ModelTestScreen} />
        <RootStack.Screen name="DailyBrief" component={DailyBriefScreen} />
        <RootStack.Screen name="KnowledgeBase" component={KnowledgeBaseScreen} />
        <RootStack.Screen name="DocumentPreview" component={DocumentPreviewScreen} />
        <RootStack.Screen name="ModelSettings" component={ModelSettingsScreen} />
        <RootStack.Screen name="RemoteServers" component={RemoteServersScreen} />
        <RootStack.Screen name="DeviceInfo" component={DeviceInfoScreen} />
        <RootStack.Screen name="StorageSettings" component={StorageSettingsScreen} />
        <RootStack.Screen name="SecuritySettings" component={SecuritySettingsScreen} />
        <RootStack.Screen name="Appearance" component={AppearanceScreen} />
        <RootStack.Screen
          name="ProDetail"
          component={ProDetailScreen}
          options={{ headerShown: false, animation: 'slide_from_bottom' }}
        />
        <RootStack.Screen
          name="About"
          component={AboutScreen}
          options={{ headerShown: false }}
        />
        <RootStack.Screen name="Tools" component={ToolsScreen} />
        <RootStack.Screen
          name="DownloadManager"
          component={DownloadManagerScreen}
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <RootStack.Screen
          name="Gallery"
          component={GalleryScreen}
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        {registeredScreens.map(s => (
          <RootStack.Screen key={s.name} name={s.name as any} component={s.component} />
        ))}
      </RootStack.Navigator>
    </SpotlightTourProvider>
  );
};
