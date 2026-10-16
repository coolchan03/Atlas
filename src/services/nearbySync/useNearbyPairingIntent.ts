import { useEffect } from 'react';
import { Alert, Linking } from 'react-native';
import { useAuthStore } from '../../stores';
import logger from '../../utils/logger';
import { nearbySync } from './index';

/** Android camera QR deep-link: always ask the user before trusting a new peer. */
export function useNearbyPairingIntent(): void {
  useEffect(() => {
    let lastLink = '';
    const offer = (link: string) => {
      if (!link.startsWith('atlas://sync?') || link === lastLink) return;
      lastLink = link;
      const id = /[?&]id=([a-zA-Z0-9_-]+)/.exec(link)?.[1]?.slice(0, 8) ?? 'nearby';
      Alert.alert('Pair Atlas devices?',
        `Pair with device ${id} to exchange encrypted chats, agents, projects and project documents on local Wi-Fi?`, [
          { text: 'Cancel', style: 'cancel', onPress: () => { lastLink = ''; } },
          { text: 'Pair', onPress: () => {
            if (useAuthStore.getState().isEnabled && useAuthStore.getState().isLocked) {
              Alert.alert('Unlock Atlas first', 'Unlock the app, then scan the QR code again.');
              lastLink = '';
              return;
            }
            nearbySync.joinInvitation(link).then(() =>
              Alert.alert('Device paired', 'Offline sync runs while both apps are open on the same local network.')
            ).catch(error => { lastLink = ''; Alert.alert('Pairing failed', String(error)); });
          } },
        ]);
    };
    nearbySync.init().catch(error => logger.warn('[Atlas sync] Could not initialize:', error));
    const subscription = Linking.addEventListener('url', event => offer(event.url));
    Linking.getInitialURL().then(url => { if (url) offer(url); }).catch(() => undefined);
    return () => subscription.remove();
  }, []);
}
