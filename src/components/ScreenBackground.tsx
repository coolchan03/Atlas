import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useAppStore } from '../stores/appStore';

/** Returns true when a per-screen background is configured for this key — use to set parent to transparent. */
export const useHasScreenBg = (screenKey: string): boolean =>
  useAppStore((s) => !!s.settings.screenBackgrounds?.[screenKey]?.uri);

/**
 * Absolutely-positioned background image layer. Place as first child of a screen container.
 * Returns null when no background is configured so layout is unaffected.
 */
export const ScreenBackground: React.FC<{ screenKey: string }> = ({ screenKey }) => {
  const bg = useAppStore((s) => s.settings.screenBackgrounds?.[screenKey]);
  if (!bg?.uri) return null;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: 0 }]}>
      <Image source={{ uri: bg.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" blurRadius={bg.blur ?? 0} />
      {(bg.dim ?? 0) > 0 && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(0,0,0,${bg.dim})` }]} />
      )}
    </View>
  );
};
