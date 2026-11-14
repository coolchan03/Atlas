/* eslint-disable prefer-template, max-params */
import { pick } from '../utils/pick';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, Text, TextInput, TouchableOpacity, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTheme } from '../theme';
import { defaultPresentationSlides, PRESENTATION_TEMPLATES, SLIDE_LAYOUTS, slideHasBullets, cleanPresentationSlides,
  type PresentationSlide, type PresentationStyleId } from '../services/presentationTemplates';
import { exportPresentation, sharePresentation, type ExportedPresentation, type PresentationFormat } from '../services/presentationExport';

const DRAFT_KEY = 'atlas-presentation-draft-v1';
type Layout = PresentationSlide['layout'];
const defaultSlide = (layout: Layout): PresentationSlide =>
  ({ layout, title: layout === 'closing' ? 'Thank You' : layout === 'title' ? 'New Presentation' : layout === 'section' ? 'New Section'
      : layout === 'quote' ? 'A sentence worth remembering' : layout === 'stat' ? '85%' : layout === 'agenda' ? 'Agenda' : 'New Slide',
    subtitle: layout === 'quote' ? 'Who said it' : layout === 'stat' ? 'What the number means' : '',
    bullets: slideHasBullets(layout) ? (layout === 'twoColumn' ? ['First point', 'Second point'] : ['First point']) : [] });

export const PresentationScreen: React.FC = () => {
  const navigation = useNavigation();
  const given = (useRoute<any>().params ?? {}) as { slides?: PresentationSlide[]; name?: string };
  const { colors } = useTheme();
  const [slides, setSlides] = useState<PresentationSlide[]>(defaultPresentationSlides);
  const [active, setActive] = useState(0);
  const [styleId, setStyleId] = useState<PresentationStyleId>('minimal');
  const [name, setName] = useState('My Presentation');
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState<PresentationFormat | null>(null);
  const [lastExport, setLastExport] = useState<ExportedPresentation | null>(null);
  const template = PRESENTATION_TEMPLATES.find(t => t.id === styleId) ?? PRESENTATION_TEMPLATES[0];
  const slide = slides[Math.min(active, slides.length - 1)];

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(DRAFT_KEY).then(raw => {
      if (!alive || !raw) return;
      const saved = JSON.parse(raw);
      if (Array.isArray(saved.slides) && saved.slides.length) {
        const cleaned = cleanPresentationSlides(saved.slides.filter((s: any) =>
          s && SLIDE_LAYOUTS.some(l => l.id === s.layout) && typeof s.title === 'string' &&
          typeof s.subtitle === 'string' && Array.isArray(s.bullets) && s.bullets.every((b: any) => typeof b === 'string')));
        if (cleaned.length) setSlides(cleaned);
      }
      if (PRESENTATION_TEMPLATES.some(t => t.id === saved.styleId)) setStyleId(saved.styleId);
      if (typeof saved.name === 'string') setName(saved.name.slice(0, 70));
    }).catch(() => undefined).finally(() => {
      if (!alive) return;
      // Slides made from a chat reply replace the draft (the old draft is kept under another key).
      if (given.slides?.length) {
        AsyncStorage.getItem(DRAFT_KEY).then(old => { if (old) void AsyncStorage.setItem(`${DRAFT_KEY}-previous`, old); }).catch(() => undefined);
        setSlides(cleanPresentationSlides(given.slides)); setActive(0);
        if (given.name) setName(given.name.slice(0, 70));
      }
      setHydrated(true);
    });
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    const timeout = setTimeout(() => AsyncStorage.setItem(DRAFT_KEY, JSON.stringify({ slides, styleId, name }))
      .catch(() => undefined), 450);
    return () => clearTimeout(timeout);
  }, [slides, styleId, name, hydrated]);

  const update = (values: Partial<PresentationSlide>) => setSlides(previous =>
    previous.map((item, i) => i === active ? { ...item, ...values } : item));
  const add = (layout: Layout) => {
    if (slides.length >= 40) return Alert.alert('Slide limit', 'A presentation can contain up to 40 slides.');
    setSlides(old => [...old, defaultSlide(layout)]);
    setActive(slides.length);
  };
  const move = (direction: -1 | 1) => {
    const to = active + direction;
    if (to < 0 || to >= slides.length) return;
    setSlides(previous => {
      const result = [...previous];
      [result[active], result[to]] = [result[to], result[active]];
      return result;
    });
    setActive(to);
  };
  const remove = () => {
    if (slides.length === 1) return Alert.alert('One slide required', 'Add another slide before removing this one.');
    setSlides(previous => previous.filter((_,i) => i !== active));
    setActive(Math.max(0, Math.min(active, slides.length - 2)));
  };
  const save = async (format: PresentationFormat) => {
    if (busy) return;
    setBusy(format);
    try {
      const exported = await exportPresentation(slides, template, name, format);
      setLastExport(exported);
      Alert.alert('Presentation saved', exported.name + ' is in Downloads / Atlas. You can also share it from this screen.',
        [{ text: 'OK' }, { text: 'Share', onPress: () => sharePresentation(exported).catch(e => Alert.alert('Share failed', String(e?.message ?? e))) }]);
    } catch (error: any) {
      Alert.alert('Export failed', String(error?.message ?? error));
    } finally { setBusy(null); }
  };
  const action = (label: string, onPress: () => void, icon: string, disabled = false, emphasized = false) => (
    <TouchableOpacity key={label} accessibilityRole="button" accessibilityLabel={label} disabled={disabled}
      onPress={onPress} style={[staticStyles.h1, { opacity: pick(!!disabled, 0.4, 1), backgroundColor: emphasized ? colors.primary : colors.surface, borderColor: emphasized ? colors.primary : colors.border }]}>
      <Icon name={icon} size={17} color={emphasized ? colors.background : colors.text} />
      <Text style={[staticStyles.h2, { color: emphasized ? colors.background : colors.text }]}>{label}</Text>
    </TouchableOpacity>
  );
  const label = (title: string) => <Text style={[staticStyles.h3, { color: colors.textSecondary }]}>{title}</Text>;
  const field = (value: string, onChangeText: (text: string) => void, placeholder: string, multiline = false) =>
    <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder}
      accessibilityLabel={placeholder} placeholderTextColor={colors.textMuted}
      multiline={multiline} scrollEnabled={false}
      style={[staticStyles.h4, { borderColor: colors.border, backgroundColor: colors.surface, color: colors.text, minHeight: pick(!!multiline, 115, 45), textAlignVertical: pick(!!multiline, 'top' as const, 'center' as const) }]} />;

  return (
    <SafeAreaView edges={['top', 'bottom']} style={[staticStyles.h5, { backgroundColor: colors.background }]}>
      <View style={[staticStyles.h6, { borderColor: colors.border }]}>
        <TouchableOpacity accessibilityLabel="Back" onPress={() => navigation.goBack()}>
          <Icon name="arrow-left" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={staticStyles.h7}>
          <Text style={[staticStyles.h8, { color: colors.text }]}>Presentation Studio</Text>
          <Text style={[staticStyles.h9, { color: colors.textMuted }]}>Offline PowerPoint and PDF creator</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={staticStyles.h33}>
        <View>{label('File name')}{field(name, text => setName(text.slice(0, 70)), 'Presentation name')}</View>
        <View>
          {label('Choose a PowerPoint template')}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={staticStyles.h34}>
            {PRESENTATION_TEMPLATES.map(t => (
              <TouchableOpacity key={t.id} accessibilityRole="button" accessibilityState={{ selected: styleId === t.id }}
                testID={'presentation-template-' + t.id} onPress={() => setStyleId(t.id)}
                style={[staticStyles.h10, { backgroundColor: colors.surface, borderWidth: pick(styleId === t.id, 2, 1), borderColor: styleId === t.id ? colors.primary : colors.border }]}>
                <View style={[staticStyles.h11, { aspectRatio: 16/9, backgroundColor: '#' + t.background }]}>
                  <View style={[staticStyles.h12, { backgroundColor: '#' + t.accent }]} />
                  <View style={[staticStyles.h13, { backgroundColor: '#' + t.foreground }]} />
                  <View style={[staticStyles.h14, { backgroundColor: '#' + t.secondary }]} />
                </View>
                <Text style={[staticStyles.h15, { color: colors.text }]}>{t.name}</Text>
                <Text style={[staticStyles.h16, { color: colors.textMuted }]}>{t.description}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
        <View>{label('Slides - tap a number to edit')}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={staticStyles.h35}>
            {slides.map((s,i) => (
              <TouchableOpacity key={i} testID={'presentation-slide-' + i} onPress={() => setActive(i)}
                accessibilityRole="button" accessibilityState={{ selected: i === active }}
                style={[staticStyles.h17, { backgroundColor: i === active ? colors.primary : colors.surface, borderColor: colors.border }]}>
                <Text style={{ color: i === active ? colors.background : colors.text }}>{i + 1}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
        <View style={[staticStyles.h18, { borderColor: colors.border }]}>
          <View testID="presentation-slide-preview" style={[staticStyles.h19, { aspectRatio: 16/9, backgroundColor: '#' + template.background }]}>
            {slide.layout !== 'bullets' && <View style={[staticStyles.h20, { backgroundColor: '#' + template.accent }]} />}
            <Text numberOfLines={3} style={[staticStyles.h21, { fontSize: pick(slide.layout === 'bullets', 21, 25), color: '#' + template.foreground }]}>{slide.title || 'Your title'}</Text>
            {!!slide.subtitle && <Text numberOfLines={2} style={[staticStyles.h22, { color: '#' + template.secondary }]}>{slide.subtitle}</Text>}
            {slide.layout === 'bullets' && <View style={[staticStyles.h23, { backgroundColor: '#' + template.panel }]}>
              {slide.bullets.slice(0, 6).map((b,i) => <Text key={i} numberOfLines={1} style={[staticStyles.h24, { color: '#' + template.foreground }]}>{'\u2022'}  {b}</Text>)}
            </View>}
          </View>
        </View>
        <View style={staticStyles.h25}>
          {action('Move left', () => move(-1), 'arrow-left', active === 0)}
          {action('Move right', () => move(1), 'arrow-right', active === slides.length - 1)}
          {action('Delete slide', remove, 'trash-2', slides.length === 1)}
        </View>
        <View>{label('Slide layout')}
          <View style={staticStyles.h26}>
            {SLIDE_LAYOUTS.map(l => action(l.label, () => update({ layout: l.id }), l.icon, false, slide.layout === l.id))}
          </View>
        </View>
        <View>{label('Slide title')}{field(slide.title, text => update({ title: text.slice(0,140) }), 'Slide title')}</View>
        <View>{label('Subtitle')}{field(slide.subtitle, text => update({ subtitle: text.slice(0,260) }), 'Slide subtitle')}</View>
        {slideHasBullets(slide.layout) && <View>
          {label(slide.layout === 'stat' ? 'Notes under the number - one per line' : 'Bullet points - one per line')}
          {field(slide.bullets.join('\n'), text => update({ bullets: text.split('\n').slice(0, 10).map(b => b.slice(0,260)) }),
            'Main points', true)}
        </View>}
        <View>{label('Add another slide')}
          <View style={staticStyles.h27}>
            {SLIDE_LAYOUTS.map(l => action(l.label, () => add(l.id), 'plus'))}
          </View>
        </View>
        <View style={[staticStyles.h28, { borderColor: colors.border }]}>
          <Text style={[staticStyles.h29, { color: colors.text }]}>Export</Text>
          <Text style={{ color: colors.textSecondary }}>Files are saved to Downloads / Atlas. Text and shapes remain editable in PowerPoint.</Text>
          {Platform.OS !== 'android' && <Text style={{ color: colors.textMuted }}>File export is currently available on Android.</Text>}
          <View style={staticStyles.h30}>
            {action('PowerPoint (.pptx)', () => save('pptx'), 'monitor', !!busy || Platform.OS !== 'android', true)}
            {action('PDF (.pdf)', () => save('pdf'), 'file-text', !!busy || Platform.OS !== 'android', true)}
            {lastExport && action('Share last export', () =>
              sharePresentation(lastExport).catch(e => Alert.alert('Share failed', String(e?.message ?? e))),
              'share-2', !!busy)}
          </View>
          {!!busy && <View style={staticStyles.h31}>
            <ActivityIndicator color={colors.primary} />
            <Text style={{ color: colors.textSecondary }}>Exporting {busy.toUpperCase()}...</Text>
          </View>}
          <Text style={[staticStyles.h32, { color: colors.textMuted }]}>Your editable draft is saved automatically on this device.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const staticStyles = StyleSheet.create({
  h1: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 12, paddingHorizontal: 15, borderRadius: 10, borderWidth: 1 },
  h2: { fontWeight: '600' },
  h3: { marginBottom: 8, fontWeight: '600', fontSize: 13 },
  h4: { borderRadius: 10, borderWidth: 1, fontSize: 16, paddingHorizontal: 13, paddingVertical: 11 },
  h5: { flex: 1 },
  h6: { padding: 16, flexDirection: 'row', alignItems: 'center', gap: 13, borderBottomWidth: 1 },
  h7: { flex: 1 },
  h8: { fontSize: 20, fontWeight: '700' },
  h9: { fontSize: 12 },
  h10: { width: 124, padding: 10, borderRadius: 11, gap: 7 },
  h11: { padding: 9, justifyContent: 'center' },
  h12: { height: 4, marginBottom: 6 },
  h13: { width: '65%', height: 6, borderRadius: 3 },
  h14: { width: '45%', height: 3, marginTop: 6, borderRadius: 2 },
  h15: { fontWeight: '600' },
  h16: { fontSize: 11 },
  h17: { paddingHorizontal: 13, paddingVertical: 10, borderRadius: 8, borderWidth: 1 },
  h18: { borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  h19: { padding: 23, justifyContent: 'center' },
  h20: { height: 6, width: '65%', marginBottom: 18 },
  h21: { fontWeight: '700' },
  h22: { marginTop: 8, fontSize: 14 },
  h23: { marginTop: 12, borderRadius: 9, padding: 12, gap: 5 },
  h24: { fontSize: 12 },
  h25: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  h26: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  h27: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  h28: { borderTopWidth: 1, paddingTop: 18, gap: 10 },
  h29: { fontSize: 18, fontWeight: '700' },
  h30: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  h31: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  h32: { fontSize: 12 },
  h33: { padding: 17, gap: 16, paddingBottom: 45 },
  h34: { gap: 10 },
  h35: { gap: 7 },
});
