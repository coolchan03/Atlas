import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../theme';
import { SPACING, TYPOGRAPHY } from '../constants';
import { buildCapabilities } from '../services/buildCapabilities';

/** This version of Atlas: the CPU type it was built for, and every feature that depends on native code with whether it is in this build. */
export function BuildFeaturesCard() {
  const { colors } = useTheme();
  const caps = buildCapabilities();
  const missing = caps.features.filter((f) => !f.available);
  return (
    <View style={styles.box} testID="build-features">
      <Text style={{ color: colors.text, ...TYPOGRAPHY.h3 }}>This version of Atlas</Text>
      <Text style={{ color: colors.textSecondary, ...TYPOGRAPHY.bodySmall }} testID="build-abi">
        {caps.unknown ? 'Built for this phone.' : `Built for ${caps.abiName} (${caps.abi}).`}
        {missing.length ? ` ${missing.length} feature${missing.length === 1 ? ' is' : 's are'} not in this version.` : caps.unknown ? '' : ' Every feature is included.'}
      </Text>
      {caps.features.map((f) => (
        <View key={f.id} style={styles.row} testID={`build-feature-${f.id}`}>
          <Icon name={f.available ? 'check' : 'slash'} size={16} color={f.available ? colors.success : colors.textMuted} />
          <View style={styles.text}>
            <Text style={{ color: f.available ? colors.text : colors.textSecondary, ...TYPOGRAPHY.body }}>{f.label}{f.available ? '' : ': not in this version'}</Text>
            {!f.available && <Text style={{ color: colors.textSecondary, ...TYPOGRAPHY.bodySmall }}>{f.missing}</Text>}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: SPACING.sm },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm },
  text: { flex: 1, gap: 2 },
});
