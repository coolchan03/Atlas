import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { AnimatedListItem } from '../../../components/AnimatedListItem';
import { useTheme, useThemedStyles } from '../../../theme';
import { createStyles } from '../styles';
import { Conversation } from '../../../types';
import { useChatOptions } from '../../../components/ChatOptions';

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (diffDays === 1) {
    return 'Yesterday';
  }
  if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: 'short' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

type Props = {
  conversations: Conversation[];
  /** Total chats across all conversations — shown next to "See all". */
  totalCount?: number;
  focusTrigger: number;
  onContinueChat: (conversationId: string) => void;
  onSeeAll: () => void;
};

export const RecentConversations: React.FC<Props> = ({
  conversations,
  totalCount,
  focusTrigger,
  onContinueChat,
  onSeeAll,
}) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  // Long-press opens the same options as the Chats tab (no swipe: it deleted chats by accident).
  const chatOptions = useChatOptions();

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Recent</Text>
        <TouchableOpacity onPress={onSeeAll} testID="conversation-list-button">
          <Text style={styles.seeAll}>
            See all{typeof totalCount === 'number' ? ` (${totalCount})` : ''}
          </Text>
        </TouchableOpacity>
      </View>
      {conversations.map((conv, index) => (
          <AnimatedListItem
            key={conv.id}
            index={index}
            staggerMs={40}
            trigger={focusTrigger}
            style={styles.conversationItem}
            onPress={() => onContinueChat(conv.id)}
            onLongPress={() => chatOptions.open(conv)}
            testID={`conversation-item-${index}`}
          >
            <View style={styles.conversationInfo}>
              <View style={styles.conversationHeader}>
                <Text style={styles.conversationTitle} numberOfLines={1}>
                  {conv.pinVerifier ? 'Locked conversation' : conv.title}
                </Text>
                <Text style={styles.conversationMeta}>
                  {formatDate(conv.updatedAt)}
                </Text>
              </View>
              {conv.pinVerifier ? <Text style={styles.conversationPreview}>PIN required</Text> : conv.messages.length > 0 && (() => {
                const lastMsg = conv.messages[conv.messages.length - 1];
                return (
                  <Text style={styles.conversationPreview} numberOfLines={1}>
                    {lastMsg.role === 'user' ? 'You: ' : ''}{lastMsg.content}
                  </Text>
                );
              })()}
            </View>
            <Icon name="chevron-right" size={14} color={colors.textMuted} />
          </AnimatedListItem>
      ))}
      {chatOptions.element}
    </View>
  );
};
