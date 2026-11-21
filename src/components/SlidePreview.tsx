import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { previewShapes, SLIDE_H, SLIDE_PT_WIDTH, SLIDE_W, templateFonts, type PreviewFont, type PreviewShape, type PreviewText } from '../services/presentationPreview';
import type { PresentationSlide, PresentationTemplate } from '../services/presentationTemplates';

/** iOS has no "sans-serif-light" and the like: ask it for system families that look alike. */
const forPlatform = (f: PreviewFont): PreviewFont => {
  if (Platform.OS !== 'ios') return f;
  const family = f.fontFamily === 'serif' ? 'Georgia' : f.fontFamily === 'monospace' ? 'Courier' : f.fontFamily === 'casual' ? 'Marker Felt' : f.fontFamily === 'sans-serif-condensed' ? 'Avenir Next Condensed' : 'Helvetica Neue';
  return { ...f, fontFamily: family };
};

const styles = StyleSheet.create({
  slide: { overflow: 'hidden' },
  shape: { position: 'absolute', overflow: 'hidden' },
});

const slideStyle = (width: number, background: string) => ({ width, height: SLIDE_H * (width / SLIDE_W), backgroundColor: `#${background}` });
const shapeStyle = (s: PreviewShape, scale: number) => ({ left: s.x * scale, top: s.y * scale, width: s.w * scale, height: s.h * scale, backgroundColor: s.fill ? `#${s.fill}` : undefined });
const textStyle = (l: PreviewText, f: PreviewFont, pt: number) => ({
  color: `#${l.color}`, fontSize: l.size * pt, lineHeight: l.size * pt * 1.2, fontFamily: f.fontFamily,
  fontWeight: l.bold ? ('bold' as const) : f.fontWeight ?? ('normal' as const), fontStyle: l.italic ? ('italic' as const) : f.fontStyle, letterSpacing: f.letterSpacing,
});

/** One slide as it will look in the PowerPoint: the same shapes and text sizes for every layout, in the style's own fonts. `width` is the box's width in points. */
export function SlidePreview({ slide, template, width, testID }: { slide: PresentationSlide; template: PresentationTemplate; width: number; testID?: string }) {
  const scale = width / SLIDE_W;
  const fonts = templateFonts(template);
  const pt = width / SLIDE_PT_WIDTH; // points on the slide to points on the screen
  return (
    <View testID={testID} style={[styles.slide, slideStyle(width, template.background)]}>
      {previewShapes(slide, template).map((s, i) => (
        <View key={i} style={[styles.shape, shapeStyle(s, scale)]}>
          {s.lines?.map((l, k) => (
            <Text key={k} testID={`slide-text-${i}-${k}`} numberOfLines={l.size >= 40 ? 3 : 2} style={textStyle(l, forPlatform(l.font === 'heading' ? fonts.heading : fonts.body), pt)}>{l.text}</Text>
          ))}
        </View>
      ))}
    </View>
  );
}
