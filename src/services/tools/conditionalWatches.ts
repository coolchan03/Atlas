import { NativeModules, PermissionsAndroid, Platform } from 'react-native';
import * as DT from '../../atlasTools/deviceTools';

export interface ConditionalRule {
  name: string; url: string; kind: 'text' | 'json' | 'status' | 'change';
  allOf?: string[]; noneOf?: string[]; path?: string;
  operator?: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte';
  target?: string | number | boolean; status?: number; pollHours?: number;
}

export function validateConditionalRule(rule: ConditionalRule): ConditionalRule {
  if (!rule || typeof rule.name !== 'string' || rule.name.trim().length < 3 || rule.name.length > 100) throw new Error('Invalid watch name.');
  if (!rule.url || rule.url.length > 1200) throw new Error('Source URL is required.');
  const url = new URL(rule.url);
  if (url.protocol !== 'https:' || !url.hostname.includes('.') || url.port || url.username || url.password || url.hash ||
    /(^|\.)(localhost|local|internal|test|lan|home)$/.test(url.hostname) || /^[0-9.]+$/.test(url.hostname) ||
    url.hostname.includes(':')) throw new Error('Use an ordinary public HTTPS source URL.');
  const hours = rule.pollHours ?? 6;
  if (!Number.isInteger(hours) || hours < 1 || hours > 24) throw new Error('Check every 1 to 24 hours.');
  if (rule.kind === 'text') {
    if (!Array.isArray(rule.allOf) || rule.allOf.length < 1 || rule.allOf.length > 4 ||
        rule.allOf.some(p => typeof p !== 'string' || p.trim().length < 3 || p.length > 100)) throw new Error('Choose 1-4 required text phrases.');
    if (rule.noneOf && (!Array.isArray(rule.noneOf) || rule.noneOf.length > 4 || rule.noneOf.some(p => typeof p !== 'string' || p.trim().length < 3 || p.length > 100))) throw new Error('Invalid excluded text phrases.');
  } else if (rule.kind === 'json') {
    if (!rule.path || !/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z0-9_]+){0,9}$/.test(rule.path) ||
      !['eq', 'neq', 'gt', 'gte', 'lt', 'lte'].includes(rule.operator || '') ||
      !['string','number','boolean'].includes(typeof rule.target)) throw new Error('Invalid JSON comparison.');
    if (['gt', 'gte', 'lt', 'lte'].includes(rule.operator || '') && (typeof rule.target !== 'number' || !Number.isFinite(rule.target))) throw new Error('Numeric comparison requires numeric target.');
  } else if (rule.kind === 'status') {
    if (!Number.isInteger(rule.status) || (rule.status || 0) < 100 || (rule.status || 0) > 599) throw new Error('HTTP status must be 100-599.');
  } else if (rule.kind !== 'change') throw new Error('Unsupported condition type.');
  return { ...rule, name: rule.name.trim(), pollHours: hours };
}

function bridge(): any {
  if (Platform.OS !== 'android' || !NativeModules.AtlasConditionalWatches) throw new Error('An updated Atlas Android APK is required.');
  return NativeModules.AtlasConditionalWatches;
}

export async function createConditionalWatch(json: string): Promise<string> {
  const rule = validateConditionalRule(JSON.parse(json));
  const ok = await DT.confirm('Create conditional notification?', 'Condition: ' + rule.name + '\nSource: ' + rule.url + '\nRules: ' + JSON.stringify(rule) +
    '\nCheck every ' + rule.pollHours + ' hours. Alert only after two successful matches. Stops after alert; no scripts run.', 'Create');
  if (!ok) return 'The user declined to create a watch.';
  if (Number(Platform.Version) >= 33) {
    const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    if (granted !== PermissionsAndroid.RESULTS.GRANTED) return 'Notification permission denied; nothing scheduled.';
  }
  const id = await bridge().create(JSON.stringify(rule));
  return 'Created conditional watch ' + rule.name + ' (' + id + '). Checks may be delayed by Android.';
}
export async function listConditionalWatches(): Promise<string> {
  const list = await bridge().list() as Array<{ id: string; name: string; status: string; lastResult: string; triggered: boolean }>;
  return list.length ? list.map(w => '- ' + w.name + ' [' + w.id + ']: ' + (w.triggered ? 'triggered' : w.status) + '; ' + w.lastResult).join('\n')
    : 'No conditional watches configured.';
}
export async function cancelConditionalWatch(id: string): Promise<string> {
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(id)) throw new Error('Invalid watch ID.');
  await bridge().cancel(id);
  return 'Cancelled watch ' + id;
}
