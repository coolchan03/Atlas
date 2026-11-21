import { useCallback } from 'react';
import { showAlert, hideAlert } from '../../../components';
import { useRemoteServerStore } from '../../../stores/remoteServerStore';
import { remoteServerManager } from '../../../services';
import { discoverLANServers } from '../../../services/networkDiscovery';
import type { HomeScreenNavigationProp } from './types';
import logger from '../../../utils/logger';

interface LANDiscoveryParams {
  navigation: HomeScreenNavigationProp;
  setAlertState: (state: any) => void;
}

export function useLANDiscovery({ navigation, setAlertState }: LANDiscoveryParams) {
  const addNewServersAndNotify = useCallback(async (
    newServersToAdd: Awaited<ReturnType<typeof discoverLANServers>>
  ) => {
    for (const server of newServersToAdd) {
      logger.log('[HomeScreen] Auto-adding discovered server:', server.name);
      const added = await remoteServerManager.addServer({
        name: server.name,
        endpoint: server.endpoint,
        providerType: 'openai-compatible',
      });
      remoteServerManager.testConnection(added.id).catch(() => { });
    }

    if (newServersToAdd.length === 0) return;

    const names = newServersToAdd.map(s => s.name).join(', ');
    const title = newServersToAdd.length === 1
      ? 'LLM Server Found'
      : `${newServersToAdd.length} LLM Servers Found`;
    setAlertState(showAlert(
      title,
      `Discovered on your network: ${names}. You can select a model from the model picker.`,
      [
        { text: 'Dismiss', style: 'cancel' },
        {
          text: 'View Servers', onPress: () => {
            setAlertState(hideAlert());
            navigation.navigate('RemoteServers');
          }
        },
      ],
    ));
  }, [navigation, setAlertState]);

  const runLANDiscovery = useCallback(async () => {
    let discovered: Awaited<ReturnType<typeof discoverLANServers>>;
    try {
      discovered = await discoverLANServers();
    } catch (error) {
      logger.warn('[HomeScreen] LAN discovery skipped:', (error as Error).message);
      return;
    }
    if (discovered.length === 0) return;

    const existingServers = useRemoteServerStore.getState().servers;
    const existingEndpoints = new Set(existingServers.map(s => s.endpoint.replace(/\/$/, '')));

    // Port numbers are not server identity. Two legitimate LAN hosts commonly
    // run Ollama on :11434 or LM Studio on :1234; treating "same port" as a
    // moved server could overwrite an existing endpoint and send its API key
    // to a different machine. Only exact endpoints are deduplicated.
    const newServersToAdd = discovered.filter(
      d => !existingEndpoints.has(d.endpoint.replace(/\/$/, '')),
    );

    await addNewServersAndNotify(newServersToAdd);
  }, [addNewServersAndNotify]);

  return { runLANDiscovery };
}
