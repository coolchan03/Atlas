/**
 * Every persisted app store by its storage key, so backup restore and offline sync can load
 * new data into the running app right away (otherwise the in-memory store would write its old
 * state back over it). One list, used by both.
 */
const STORES: Record<string, () => any> = {
  'local-llm-chat-storage': () => require('../stores/chatStore').useChatStore,
  'remote-servers': () => require('../stores/remoteServerStore').useRemoteServerStore,
  'local-llm-whisper-storage': () => require('../stores/whisperStore').useWhisperStore,
  'local-llm-app-storage': () => require('../stores/appStore').useAppStore,
  'local-llm-project-storage': () => require('../stores/projectStore').useProjectStore,
  'atlas-agent-storage': () => require('../stores/agentStore').useAgentStore,
  'atlas-voice-settings': () => require('../atlasVoice/store').useAtlasVoiceStore,
  'atlas-voice-profiles': () => require('../atlasVoice/profiles').useVoiceProfiles,
  'atlas-voice-reference-metadata-v1': () => require('../atlasVoice/cloneStore').useCloneReferences,
  'atlas-search-settings': () => require('../services/tools/webSearchProviders').useSearchSettings,
  'atlas-maps': () => require('../atlasMaps/maps').useMaps,
  'atlas-survival-manual': () => require('../survival/store').useSurvivalStore,
  'atlas-chat-prefs': () => require('./chatPrefs').useChatPrefs,
  'atlas-off-grid': () => require('./offGrid').useOffGrid,
  'atlas-offline-library': () => require('./offlineLibrary').useOfflineLibrary,
  'atlas-low-power': () => require('./lowPower').useLowPower,
  'atlas-learning': () => require('../learning/store').useLearningStore,
  'atlas-study': () => require('../study/engine').useStudyStore,
  'atlas-study-progress': () => require('../study/progress').useStudyProgress,
  'atlas-daily-brief': () => require('./dailyBrief').useBriefPrefs,
  'atlas-checklists': () => require('./checklists').useChecklists,
  'atlas-language': () => require('../language/store').useLanguage,
  'atlas-recordings': () => require('../atlasRecorder/store').useRecordings,
  'atlas-about-me': () => require('../stores/aboutMeStore').useAboutMe,
  'atlas-skills': () => require('../skills/skillsStore').useSkills,
  'atlas-schedule': () => require('../schedule/store').useSchedule,
  'atlas-topics': () => require('../topics/store').useTopics,
  'atlas-pins': () => require('../pins/store').usePins,
  'atlas-exercises': () => require('../study/exercises').useExerciseStore,
  'atlas-cpa-prep': () => require('../cpa/store').useCpa,
  'atlas-study-plan': () => require('../study/planStore').usePlanStore,
  'atlas-custom-home-shortcuts-v1': () => require('../screens/HomeScreen/homeShortcutStore').useHomeShortcuts,
  'atlas-call-prefs': () => require('../screens/HomeScreen/callPrefs').useCallPrefs,
  'atlas-pressure-log': () => require('./pressureLog').usePressureLog,
  'atlas-memory-choice-v1': () => require('../stores/autoMemory').useAutoMemory,
};

/** Loads the given stores from storage again (unknown keys and missing stores are skipped). */
export async function rehydrateStores(keys: Iterable<string>): Promise<void> {
  for (const key of keys) {
    try { await STORES[key]?.()?.persist?.rehydrate?.(); } catch { /* store not present in this build */ }
  }
}

export const persistedStoreKeys = () => Object.keys(STORES);
