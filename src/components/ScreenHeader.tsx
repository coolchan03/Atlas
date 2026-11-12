import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../theme';
import { SPACING, TYPOGRAPHY } from '../constants';

interface Props {
  title: string;
  /** Right-hand control, such as a refresh or mode button. */
  right?: React.ReactNode;
  /** Pass the night-red palette on the emergency tool screens; defaults to the app theme. */
  colors?: { text: string; border: string };
}

/** The back arrow, title and optional action shared by the full-screen tools. */
export const ScreenHeader: React.FC<Props> = ({ title, right, colors: given }) => {
  const navigation = useNavigation<any>();
  const { colors: theme } = useTheme();
  const colors = given ?? theme;
  return (
    <View style={[styles.header, { borderBottomColor: colors.border }]}>
      <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Back">
        <Icon name="arrow-left" size={22} color={colors.text} />
      </TouchableOpacity>
      <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{title}</Text>
      {right}
    </View>
  );
};

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, borderBottomWidth: 1 },
  back: { padding: SPACING.xs, marginRight: SPACING.sm },
  title: { ...TYPOGRAPHY.h2, flex: 1 },
});
