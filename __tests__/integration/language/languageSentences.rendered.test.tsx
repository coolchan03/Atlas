/** Unspaced examples reach real lessons and saved complete lessons do not invoke the model again. */
import { installNativeBoundary, GB, requireRTL } from '../../harness/nativeBoundary';
import { createDownloadedModel } from '../../utils/factories';

jest.unmock('@react-navigation/native');

const examples = [
  ['The bicycle is red.', '自転車は赤いです。', 'Jitensha wa akai desu.', '自行车是红色的。', 'Zixingche shi hongse de.'],
  ['I like the blue sky.', '私は青い空が好きです。', 'Watashi wa aoi sora ga suki desu.', '我喜欢蓝色的天空。', 'Wo xihuan lanse de tiankong.'],
  ['Is your house white?', 'あなたの家は白いですか？', 'Anata no ie wa shiroi desu ka?', '你的房子是白色的吗？', 'Ni de fangzi shi baise de ma?'],
  ['We have a black dog.', '私たちは黒い犬を飼っています。', 'Watashitachi wa kuroi inu o katte imasu.', '我们有一只黑色的狗。', 'Women you yi zhi heise de gou.'],
  ['The door is not green.', 'ドアは緑ではありません。', 'Doa wa midori dewa arimasen.', '门不是绿色的。', 'Men bu shi luse de.'],
];
const sentences = (language: 'ja' | 'zh') => examples.map(([en, ja, romaji, zh, pinyin]) => ({
  en, t: language === 'ja' ? ja : zh, romanization: language === 'ja' ? romaji : pinyin,
}));
const shortWords = (language: 'ja' | 'zh') => [
  { en: 'The color of a clear midday sky', t: language === 'ja' ? '青' : '蓝色' },
  { en: 'The color of newly fallen snow', t: language === 'ja' ? '白。' : '白色。' },
  { en: 'The color of a ripe tomato', t: language === 'ja' ? '赤' : '红色' },
];

it('keeps Japanese and Chinese sentences with pronunciation and reuses hydrated content and review state', async () => {
  const boundary = installNativeBoundary({ llama: true, fs: true, ram: { platform: 'android', totalBytes: 12 * GB, availBytes: 8 * GB } });
  const rtl = requireRTL();
  const React = require('react');
  const AsyncStorage = require('@react-native-async-storage/async-storage');
  const { NavigationContainer } = require('@react-navigation/native');
  const { createNativeStackNavigator } = require('@react-navigation/native-stack');
  const { useAppStore } = require('../../../src/stores');
  const { hardwareService } = require('../../../src/services/hardware');
  const { activeModelService } = require('../../../src/services/activeModelService');
  const { useLanguage } = require('../../../src/language/store');
  const { unitById } = require('../../../src/language/curriculum');
  const { levelGuide } = require('../../../src/language/teaching');
  const { parseSentences } = require('../../../src/language/coursePrompts');
  const { LessonScreen } = require('../../../src/language/LessonScreen');
  const { ExerciseView } = require('../../../src/language/Exercises');
  useAppStore.getState().updateSettings({ inferenceBackend: 'cpu' });
  boundary.fs!.seedFile('/models/small.gguf', 500 * 1024 * 1024);
  await hardwareService.refreshMemoryInfo();
  await useAppStore.setState({
    downloadedModels: [createDownloadedModel({ id: 'llm', engine: 'llama', filePath: '/models/small.gguf', fileSize: 500 * 1024 * 1024 })],
    activeModelId: 'llm',
  });
  await activeModelService.loadTextModel('llm');

  const ja = ['赤', '青', '緑', '黄色', '黒', '白', '車は赤いです。', '好きな色は青です。'];
  const zh = ['红色', '蓝色', '绿色', '黄色', '黑色', '白色', '汽车是红色的。', '我最喜欢蓝色。'];
  const vocab = (translations: string[]) => unitById('colors').items.map((en: string, i: number) => ({ en, t: translations[i] }));
  await useLanguage.setState({
    language: 'ja-JP', level: 1, content: { 'ja-JP': { colors: vocab(ja) } },
    progress: {}, memory: {}, saved: {}, myWords: {}, speaking: false,
  });
  // Device data includes both valid sentences and short words whose English definitions are long.
  boundary.llama!.scriptCompletion({ text: JSON.stringify({ items: [...shortWords('ja'), ...sentences('ja')] }) });
  const Stack = createNativeStackNavigator();
  const renderLesson = () => rtl.render(React.createElement(NavigationContainer, null,
    React.createElement(Stack.Navigator, { screenOptions: { headerShown: false, animation: 'none' } },
      React.createElement(Stack.Screen, { name: 'Lesson', component: LessonScreen, initialParams: { unitId: 'colors' } }),
    ),
  ));
  const lesson = renderLesson();
  await rtl.waitFor(() => expect(useLanguage.getState().content['ja-JP'].colors).toHaveLength(ja.length + 5), { timeout: 8000 });
  expect(lesson.UNSAFE_root.findAllByType(ExerciseView)).toHaveLength(1);
  const added = useLanguage.getState().content['ja-JP'].colors.slice(ja.length);
  expect(added.map((item: { t: string; r?: string }) => [item.t, item.r])).toEqual(
    sentences('ja').map(item => [item.t, item.romanization]),
  );
  expect(boundary.llama!.calls.completion).toHaveLength(1);
  for (const language of ['ja', 'zh'] as const) {
    const code = language === 'ja' ? 'ja-JP' : 'zh-CN';
    expect(parseSentences(JSON.stringify({ items: shortWords(language) }), levelGuide(1), code)).toBeNull();
    expect(parseSentences(JSON.stringify({ items: [...shortWords(language), ...sentences(language)] }), levelGuide(1), code))
      .toEqual(sentences(language).map(({ en, t, romanization }) => ({ en, t, r: romanization })));
  }
  lesson.unmount();

  // Hydrate an already complete Chinese unit before its first opening in this process.
  // The in-memory "already topped up" set cannot hide a wrong cached-content decision.
  const complete = [...vocab(zh), ...sentences('zh').map(({ en, t, romanization }) => ({ en, t, r: romanization }))];
  const memory = { 'zh-CN': { '红色': { box: 2, due: Date.now() + 86400000 } } };
  const progress = { 'zh-CN': { colors: { stars: 2, lessons: 1 } } };
  await useLanguage.setState({ language: 'zh-CN', content: { 'zh-CN': { colors: complete } }, memory, progress });
  const saved = await AsyncStorage.getItem('atlas-language');
  expect(JSON.parse(saved).state.memory).toEqual(memory);
  await useLanguage.setState({ content: {}, memory: {}, progress: {} });
  await AsyncStorage.setItem('atlas-language', saved);
  await useLanguage.persist.rehydrate();
  boundary.llama!.scriptCompletion({ text: JSON.stringify({ items: sentences('zh') }) });
  const reopened = renderLesson();
  await rtl.waitFor(() => expect(reopened.UNSAFE_root.findAllByType(ExerciseView)).toHaveLength(1), { timeout: 8000 });
  expect(boundary.llama!.calls.completion).toHaveLength(1);
  expect(useLanguage.getState().content['zh-CN'].colors).toEqual(complete);
  expect(useLanguage.getState().memory).toEqual(memory);
  expect(useLanguage.getState().progress).toEqual(progress);
}, 20000);
