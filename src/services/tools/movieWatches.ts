/** Optional, privacy-aware theatrical release NEWS watch.
 * Notifications report *possible* release coverage, not verified showtime availability.
 */
import { NativeModules, PermissionsAndroid, Platform } from 'react-native';
import * as DT from '../../atlasTools/deviceTools';

interface Watch { id: string; title: string; possibleReleaseFound: boolean }

function bridge() {
  if (Platform.OS !== 'android' || !NativeModules.AtlasMovieWatches) {
    throw new Error('Movie watch requires the updated Atlas Android app.');
  }
  return NativeModules.AtlasMovieWatches;
}
export function movieWatchTitle(title: string): string {
  const film = String(title).trim().replace(/\s+/g, ' ');
  if (film.length < 3 || film.length > 100 || /[/\\\x00-\x1f]/.test(film)) {
    throw new Error('Enter a movie title between 3 and 100 characters.');
  }
  return film;
}
export async function watchMovieRelease(title: string): Promise<string> {
  const film = movieWatchTitle(title);
  const native = bridge();
  const ok = await DT.confirm('Watch for movie release news?',
    `Monitor public US theatrical-release news about "${film}" approximately once daily. Atlas will send this title to Google News and Bing News. If two recent reports suggest it is in theaters, you will get a POSSIBLE release notification, not confirmed local showtimes. Android may delay checks.`,
    'Watch movie');
  if (!ok) return 'The user declined to watch this movie.';
  if (Number(Platform.Version) >= 33) {
    const grant = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    if (grant !== PermissionsAndroid.RESULTS.GRANTED) return 'Notification permission denied; no movie watch created.';
  }
  const id: string = await native.watch(film);
  return `Watching movie release news for "${film}". ID: ${id}. A future alert is provisional: check actual cinema listings. Monitoring requires a connection and Android background scheduling.`;
}
export async function listMovieWatches(): Promise<string> {
  const active: Watch[] = await bridge().list();
  return active.length
    ? active.map(item => `- ${item.title}: ${item.possibleReleaseFound ? 'possible release reported' : 'monitoring'} [${item.id}]`).join('\n')
    : 'No movie release watches are scheduled.';
}
export async function cancelMovieWatch(id: string): Promise<string> {
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(id)) throw new Error('A valid watch ID is required.');
  await bridge().cancel(id);
  return `Movie watch ${id} cancelled.`;
}
