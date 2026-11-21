/**
 * Debug Logs Screen
 * Simple modal showing captured debug logs with copy and clear options
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Clipboard,
  Share,
  SafeAreaView,
  Modal,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme, useThemedStyles } from '../../theme';
import { useDebugLogsStore } from '../../stores/debugLogsStore';
import { createStyles } from './styles';

interface DebugLogsScreenProps {
  visible: boolean;
  onClose: () => void;
}

export const DebugLogsScreen: React.FC<DebugLogsScreenProps> = ({ visible, onClose }) => {
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const { logs: allLogs, clearLogs } = useDebugLogsStore();
  const [level, setLevel] = useState<'all' | 'warn' | 'error'>('all');
  // 'warn' shows warnings and errors; 'error' only errors.
  const logs = allLogs.filter(l => level === 'all' || l.level === 'error' || (level === 'warn' && l.level === 'warn'));

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  const getLogColor = (logLevel: string) => {
    switch (logLevel) {
      case 'error':
        return theme.colors.error;
      case 'warn':
        return theme.colors.trending;
      default:
        return theme.colors.textSecondary;
    }
  };

  const logsText = () =>
    logs
      .map((log: any) => `[${formatTime(log.timestamp)}] ${log.level.toUpperCase()}: ${log.message}`)
      .join('\n');

  const handleCopyAllLogs = async () => {
    try {
      await Clipboard.setString(logsText());
    } catch {
      // Failed to copy
    }
  };

  const handleShare = async () => {
    try {
      await Share.share({ message: logsText(), title: 'Debug Logs' });
    } catch {
      // Cancelled
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Debug Logs</Text>
            <Text style={styles.subtitle}>{logs.length} entries{level === 'all' ? '' : ` (of ${allLogs.length})`}</Text>
          </View>
          <TouchableOpacity accessibilityLabel="Close" onPress={onClose} hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}>
            <Icon name="x" size={24} color={theme.colors.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.actionBar}>
          {(['all', 'warn', 'error'] as const).map(l => (
            <TouchableOpacity key={l} accessibilityLabel={`Show ${l === 'all' ? 'all logs' : l === 'warn' ? 'warnings and errors' : 'errors only'}`} accessibilityState={{ selected: level === l }} style={styles.actionButton} onPress={() => setLevel(l)}>
              <Text style={[styles.actionButtonText, level !== l && { color: theme.colors.textSecondary }]}>
                {l === 'all' ? 'All' : l === 'warn' ? 'Warnings' : 'Errors'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Action Buttons */}
        <View style={styles.actionBar}>
          <TouchableOpacity style={styles.actionButton} onPress={handleCopyAllLogs}>
            <Icon name="copy" size={16} color={theme.colors.primary} style={styles.actionIcon} />
            <Text style={styles.actionButtonText}>Copy All</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={handleShare}>
            <Icon name="share-2" size={16} color={theme.colors.primary} style={styles.actionIcon} />
            <Text style={styles.actionButtonText}>Share</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={clearLogs}>
            <Icon name="trash-2" size={16} color={theme.colors.error} style={styles.actionIcon} />
            <Text style={[styles.actionButtonText, { color: theme.colors.error }]}>Clear</Text>
          </TouchableOpacity>
        </View>

        {/* Logs List */}
        {logs.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No logs yet</Text>
          </View>
        ) : (
          <FlatList
            data={logs}
            keyExtractor={(_, index) => `${index}`}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }: { item: any }) => (
              <View style={styles.logEntry}>
                <Text style={styles.logTime}>{formatTime(item.timestamp)}</Text>
                <Text style={[styles.logLevel, { color: getLogColor(item.level) }]}>
                  {item.level.toUpperCase()}
                </Text>
                <Text style={[styles.logMessage, { color: theme.colors.text }]}>
                  {item.message}
                </Text>
              </View>
            )}
            inverted
          />
        )}
      </SafeAreaView>
    </Modal>
  );
};
