import React from 'react';
import { Platform, Text, View } from 'react-native';
import { previewShapes, SLIDE_H, SLIDE_PT_WIDTH, SLIDE_W, templateFonts, type PreviewFont } from '../services/presentationPreview';
import type { PresentationSlide, PresentationTemplate } from '../services/presentationTemplates';

/** iOS has no "sans-serif-light" and the like: ask it for system families that look alike. */
const forPlatform = (f: PreviewFont): PreviewFont => {
  if (Platform.OS !== 'ios') return f;
  const family = f.fontFamily === 'serif' ? 'Georgia' : f.fontFamily === 'monospace' ? 'Courier' : f.fontFamily === 'casual' ? 'Marker Felt' : f.fontFamily === 'sans-serif-condensed' ? 'Avenir Next Condensed' : 'Helvetica Neue';
  return { ...f, fontFamily: family };
};

/** One slide as it will look in the PowerPoint: the same shapes and text sizes for every layout, in the style's own fonts. `width` is the box's width in points. */
export function SlidePreview({ slide, template, width, testID }: { slide: PresentationSlide; template: PresentationTemplate; width: number; testID?: string }) {
  const scale = width / SLIDE_W;
  const fonts = templateFonts(template);
  const pt = width / SLIDE_PT_WIDTH; // points on the slide to points on the screen
  return (
    <View testID={testID} style={{ width, height: SLIDE_H * scale, backgroundColor: `#${template.background}`, overflow: 'hidden' }}>
      {previewShapes(slide, template).map((s, i) => (
        <View key={i} style={{ position: 'absolute', left: s.x * scale, top: s.y * scale, width: s.w * scale, height: s.h * scale, backgroundColor: s.fill ? `#${s.fill}` : undefined, overflow: 'hidden' }}>
          {s.lines?.map((l, k) => {
            const f = forPlatform(l.font === 'heading' ? fonts.heading : fonts.body);
            return (
              <Text key={k} testID={`slide-text-${i}-${k}`} numberOfLines={l.size >= 40 ? 3 : 2}
                style={{ color: `#${l.color}`, fontSize: l.size * pt, lineHeight: l.size * pt * 1.2, fontFamily: f.fontFamily, fontWeight: l.bold ? 'bold' : f.fontWeight ?? 'normal', fontStyle: l.italic ? 'italic' : f.fontStyle, letterSpacing: f.letterSpacing }}>
                {l.text}
              </Text>
            );
          })}
        </View>
      ))}
    </View>
  );
}
