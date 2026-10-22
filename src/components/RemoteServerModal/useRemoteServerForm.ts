import { useState, useCallback, useEffect } from 'react';
import { remoteServerManager } from '../../services/remoteServerManager';
import { useRemoteServerStore } from '../../stores';
import { RemoteServer, RemoteModel } from '../../types';
import { isPrivateNetworkEndpoint } from '../../services/httpClient';
import { assertClaudeEndpoint } from '../../services/providers/anthropicProvider';
import { AlertState, initialAlertState, showAlert } from '../CustomAlert';

interface FormOptions {
  server?: RemoteServer;
  visible: boolean;
  onSave?: (server: RemoteServer) => void;
  onClose: () => void;
}

export function useRemoteServerForm({ server, visible, onSave, onClose }: FormOptions) {
  const [name, setName] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [notes, setNotes] = useState('');
  const [providerType, setProviderType] = useState<RemoteServer['providerType']>('openai-compatible');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [discoveredModels, setDiscoveredModels] = useState<RemoteModel[]>([]);
  const [alertState, setAlertState] = useState<AlertState>(initialAlertState);

  // If credentials, endpoint or provider changes, an old successful test is stale.
  useEffect(() => {
    setTestResult(null);
    setDiscoveredModels([]);
  }, [providerType, endpoint, apiKey]);

  // Initialize form when editing existing server
  useEffect(() => {
    let cancelled = false;
    if (server) {
      setName(server.name);
      setEndpoint(server.endpoint);
      setNotes(server.notes || '');
      setProviderType(server.providerType || 'openai-compatible');
      // Load existing API key from keychain so user can see it's set
      remoteServerManager.getApiKey(server.id).then((key) => {
        if (!cancelled) setApiKey(key || '');
      }).catch(() => { if (!cancelled) setApiKey(''); });
    } else {
      // Reset form for new server
      setName('');
      setEndpoint('');
      setApiKey('');
      setNotes('');
      setProviderType('openai-compatible');
    }
    setErrors({});
    setTestResult(null);
    setDiscoveredModels([]);
    return () => { cancelled = true; };
  }, [server, visible]);

  const validateForm = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};
    if (!name.trim()) {
      newErrors.name = 'Server name is required';
    }
    if (endpoint.trim()) {
      try {
        // Validate URL format by parsing it - constructor throws on invalid URLs
        new URL(endpoint); // eslint-disable-line no-new
      } catch {
        newErrors.endpoint = 'Invalid URL format';
      }
    } else {
      newErrors.endpoint = 'Endpoint URL is required';
    }
    if (providerType === 'anthropic') {
      try { assertClaudeEndpoint(endpoint); }
      catch { newErrors.endpoint = 'Claude API requires https://api.anthropic.com'; }
      if (!apiKey.trim()) newErrors.apiKey = 'A Claude API key is required';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [name, endpoint, providerType, apiKey]);

  const handleTestConnection = useCallback(async () => {
    if (!validateForm()) return;
    setIsTesting(true);
    setTestResult(null);
    setDiscoveredModels([]);
    try {
      const result = await remoteServerManager.testConnectionByEndpoint(endpoint, apiKey || undefined, providerType);
      if (result.success) {
        const resolvedUrl = `${endpoint.replace(/\/+$/, '')}/v1/models`;
        setTestResult({ success: true, message: `Connected (${result.latency}ms)\n${resolvedUrl}` });
        if (result.models && result.models.length > 0) {
          setDiscoveredModels(result.models);
        }
      } else {
        const triedUrl = `${endpoint.replace(/\/+$/, '')}/v1/models`;
        setTestResult({ success: false, message: `${result.error || 'Connection failed'}\nTried: ${triedUrl}` });
      }
    } catch (error) {
      setTestResult({ success: false, message: error instanceof Error ? error.message : 'Unknown error' });
    } finally {
      setIsTesting(false);
    }
  }, [endpoint, apiKey, providerType, validateForm]);

  const saveServer = useCallback(async () => {
    try {
      if (server) {
        await remoteServerManager.updateServer(server.id, { name, endpoint, notes, apiKey, providerType });
        if (discoveredModels.length > 0) {
          useRemoteServerStore.getState().setDiscoveredModels(server.id, discoveredModels);
        }
        onSave?.(server);
      } else {
        const newServer = await remoteServerManager.addServer({
          name, endpoint, providerType, notes: notes || undefined, apiKey: apiKey || undefined,
        });
        if (discoveredModels.length > 0) {
          useRemoteServerStore.getState().setDiscoveredModels(newServer.id, discoveredModels);
        }
        // Silently probe health so status shows immediately instead of "Unknown"
        remoteServerManager.testConnection(newServer.id).catch(() => { });
        onSave?.(newServer);
      }
      onClose();
    } catch (error) {
      setAlertState(showAlert('Error', error instanceof Error ? error.message : 'Failed to save server'));
    }
  }, [server, name, endpoint, apiKey, providerType, notes, discoveredModels, onSave, onClose]);

  const handleSave = useCallback(async () => {
    if (!validateForm()) return;
    // Warn if connecting to public internet
    if (endpoint && !isPrivateNetworkEndpoint(endpoint)) {
      setAlertState(showAlert(
        'Public Network Warning',
        'This endpoint appears to be on the public internet. Your data will be sent to a remote server. Continue?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Continue', onPress: () => saveServer() },
        ]
      ));
    } else {
      saveServer();
    }

  }, [validateForm, endpoint, saveServer]);

  return {
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
    isPublicNetwork: !!(endpoint && !isPrivateNetworkEndpoint(endpoint)),
    alertState,
    dismissAlert: () => setAlertState(initialAlertState),
  };
}
