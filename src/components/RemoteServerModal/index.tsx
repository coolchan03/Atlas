/**
 * Remote Server Configuration Modal
 *
 * Modal for adding and editing remote LLM server configurations.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme, useThemedStyles } from '../../theme';
import { AppSheet } from '../AppSheet';
import { CustomAlert } from '../CustomAlert';
import { RemoteServer } from '../../types';
import { createStyles } from './styles';
import { useRemoteServerForm } from './useRemoteServerForm';

interface RemoteServerModalProps {
  visible: boolean;
  onClose: () => void;
  server?: RemoteServer; // For editing existing server
  onSave?: (server: RemoteServer) => void;
}

interface TestResultSectionProps {
  testResult: { success: boolean; message: string } | null;
  discoveredModels: Array<{ id: string; name: string }>;
  styles: ReturnType<typeof createStyles>;
}

const TestResultSection: React.FC<TestResultSectionProps> = ({ testResult, discoveredModels, styles }) => (
  <>
    {testResult && (
      <View style={styles.statusContainer}>
        <View style={[styles.statusDot, testResult.success ? styles.statusDotSuccess : styles.statusDotError]} />
        <Text style={styles.statusText}>{testResult.message}</Text>
      </View>
    )}
    {discoveredModels.length > 0 && (
      <View style={styles.modelList}>
        <Text style={styles.sectionHeader}>Discovered Models</Text>
        <ScrollView style={styles.modelScroll} nestedScrollEnabled>
          {discoveredModels.map((model) => (
            <View key={model.id} style={styles.modelItem}>
              <Text style={styles.modelName}>{model.name}</Text>
            </View>
          ))}
        </ScrollView>
      </View>
    )}
  </>
);

export const RemoteServerModal: React.FC<RemoteServerModalProps> = ({
  visible,
  onClose,
  server,
  onSave,
}) => {
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);

  const [showApiKey, setShowApiKey] = useState(false);

  const {
    name, setName,
    endpoint, setEndpoint,
    providerType, setProviderType,
    apiKey, setApiKey,
    notes, setNotes,
    errors,
    isTesting,
    testResult,
    discoveredModels,
    handleTestConnection,
    handleSave,
    isPublicNetwork,
    alertState,
    dismissAlert,
  } = useRemoteServerForm({ server, visible, onSave, onClose });

  const handleDonePress = () => {
    if (testResult?.success) {
      handleSave();
      return;
    }
    onClose();
  };

  return (
    <AppSheet
      visible={visible}
      onClose={onClose}
      onHeaderClosePress={handleDonePress}
      title={server ? 'Edit Server' : 'Add Remote Server'}
      closeLabel="Done"
      snapPoints={['80%']}
      enableDynamicSizing
    >
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.label}>Server Name</Text>
        <TextInput
          style={[styles.input, errors.name && styles.inputError]}
          placeholder="e.g., My laptop"
          placeholderTextColor={theme.colors.textMuted}
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
        />
        {errors.name && <Text style={styles.errorText}>{errors.name}</Text>}

        <Text style={styles.label}>AI provider</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
          {([
            { id: 'openai-compatible', label: 'OpenAI-compatible' },
            { id: 'anthropic', label: 'Claude API' },
          ] as const).map(option => (
            <TouchableOpacity key={option.id} accessibilityRole="button"
              accessibilityState={{ selected: providerType === option.id }}
              testID={'remote-provider-' + option.id}
              onPress={() => {
                setProviderType(option.id);
                if (option.id === 'anthropic') {
                  setEndpoint('https://api.anthropic.com');
                } else if (endpoint.trim() === 'https://api.anthropic.com') {
                  setEndpoint('');
                }
              }}
              style={[styles.testButton, { flex: 1, borderWidth: 1,
                borderColor: providerType === option.id ? theme.colors.primary : theme.colors.border }]}>
              <Text style={{ color: theme.colors.text, textAlign: 'center' }}>{option.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {providerType === 'anthropic' && <Text style={styles.helperText}>
          Claude requires a separate API key from Claude Console. A Claude subscription does not include API credits.
          Chats sent to Claude leave your device and may incur usage costs.
        </Text>}
        <Text style={styles.label}>Endpoint URL</Text>
        <TextInput
          style={[styles.input, errors.endpoint && styles.inputError]}
          placeholder={providerType === 'anthropic' ? 'https://api.anthropic.com' : 'https://server.example:7878'}
          placeholderTextColor={theme.colors.textMuted}
          value={endpoint}
          onChangeText={setEndpoint}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        {errors.endpoint && <Text style={styles.errorText}>{errors.endpoint}</Text>}
        {isPublicNetwork && (
          <View style={styles.warningContainer}>
            <Text style={styles.warningText}>
              ⚠️ This endpoint is on the public internet. Your data will be sent to a remote server.
            </Text>
          </View>
        )}
        <Text style={styles.helperText}>
          {endpoint.trim()
            ? 'Model discovery: ' + endpoint.trim().replace(/\/+$/, '') + '/v1/models'
            : 'Enter a base URL for your model provider.'}
        </Text>

        <Text style={styles.label}>API Key {providerType === 'anthropic' ? '(Required)' : '(Optional)'}</Text>
        <View style={styles.apiKeyContainer}>
          <TextInput
            style={[styles.input, styles.apiKeyInput]}
            placeholder="sk-..."
            placeholderTextColor={theme.colors.textMuted}
            value={apiKey}
            onChangeText={setApiKey}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry={!showApiKey}
          />
          <TouchableOpacity style={styles.apiKeyToggle} onPress={() => setShowApiKey(v => !v)}>
            <Icon name={showApiKey ? 'eye-off' : 'eye'} size={18} color={theme.colors.textMuted} />
          </TouchableOpacity>
        </View>
        {!!errors.apiKey && <Text style={styles.errorText}>{errors.apiKey}</Text>}
        <Text style={styles.helperText}>
          {providerType === 'anthropic'
            ? 'Your API key is saved in Android Keychain, not the chat database or source code.'
            : 'Required for cloud APIs (Groq, OpenAI, OpenRouter, etc.).'}
        </Text>

        <Text style={styles.label}>Notes (Optional)</Text>
        <TextInput
          style={[styles.input, styles.notesInput]}
          placeholder="Add notes about this server..."
          placeholderTextColor={theme.colors.textMuted}
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={3}
        />

        <TestResultSection testResult={testResult} discoveredModels={discoveredModels} styles={styles} />
        {!testResult?.success && (
          <Text style={styles.helperText}>
            Test connection first to enable {server ? 'Update Server' : 'Add Server'}.
          </Text>
        )}

        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.testButton, isTesting && styles.testButtonDisabled]}
            onPress={handleTestConnection}
            disabled={isTesting}
          >
            {isTesting ? (
              <ActivityIndicator size="small" color={theme.colors.background} />
            ) : (
              <Text style={[styles.testButtonText, isTesting && styles.testButtonTextDisabled]}>
                Test Connection
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.saveButton, !testResult?.success && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={!testResult?.success}
          >
            <Text style={[styles.saveButtonText, !testResult?.success && styles.saveButtonTextDisabled]}>
              {server ? 'Update Server' : 'Add Server'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <CustomAlert {...alertState} onClose={dismissAlert} />
    </AppSheet>
  );
};
