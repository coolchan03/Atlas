import React, { useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemedStyles } from '../theme';
import { createStyles } from './UndoBar.styles';
import { subscribeUndo, undoableChat, undoDeleteChat } from './undoDelete';

/** "Chat deleted. Undo" for a few seconds after a chat is deleted. Mounted once, above every screen. */
export const UndoBar: React.FC = () => {
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const [chat, setChat] = useState(undoableChat());
  useEffect(() => subscribeUndo(() => setChat(undoableChat())), []);
  if (!chat) return null;
  return (
    <View style={[styles.bar, { bottom: insets.bottom + 72 }]} testID="undo-bar">
      <Text style={styles.text} numberOfLines={1}>Chat deleted</Text>
      <TouchableOpacity onPress={undoDeleteChat} testID="undo-delete" accessibilityLabel="Undo delete"><Text style={styles.undo}>UNDO</Text></TouchableOpacity>
    </View>
  );
};
