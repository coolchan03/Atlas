import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../theme';
import { useChatStore } from '../stores';
import { SPACING } from '../constants';
import type { Conversation } from '../types';

/** What a swipe on a chat in the list reveals: pin, archive, delete (a button you press, never done by the swipe) and the full options. */
export function ChatSwipeActions({ chat, index, onDelete, onMore }: { chat: Conversation; index: number; onDelete: (c: Conversation) => void; onMore: (c: Conversation) => void }) {
  const { colors } = useTheme();
  const button = ({ name, label, id, onPress, danger = false }: { name: string; label: string; id: string; onPress: () => void; danger?: boolean }) => (
    <TouchableOpacity accessibilityLabel={label} testID={`swipe-${id}-${index}`} style={[styles.button, { backgroundColor: danger ? colors.error : colors.surfaceLight }]} onPress={onPress}>
      <Icon name={name} size={18} color={danger ? colors.background : colors.text} />
    </TouchableOpacity>
  );
  const { setConversationPinned, setConversationArchived } = useChatStore.getState();
  return (
    <View style={styles.row}>
      {button({ name: 'star', label: chat.isPinned ? 'Unpin' : 'Pin', id: 'pin', onPress: () => setConversationPinned(chat.id, !chat.isPinned) })}
      {button({ name: 'archive', label: chat.isArchived ? 'Unarchive' : 'Archive', id: 'archive', onPress: () => setConversationArchived(chat.id, !chat.isArchived) })}
      {button({ name: 'trash-2', label: 'Delete', id: 'delete', onPress: () => onDelete(chat), danger: true })}
      {button({ name: 'more-horizontal', label: 'More options', id: 'more', onPress: () => onMore(chat) })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'stretch' },
  button: { minWidth: SPACING.xxl + SPACING.lg, alignItems: 'center', justifyContent: 'center' },
});
