import RNFS from 'react-native-fs';
import * as DT from '../../atlasTools/deviceTools';
import { codeProjectName } from './codeExecution';
import { offGridOn } from '../../atlasTools/offGrid';

/** Optional user-controlled Piston backend: no public API or token assumed. */
export interface PistonFile { name: string; content: string }
export interface PistonStage {
  stdout?: string; stderr?: string; code?: number | null; status?: string | null; message?: string | null;
}
export interface PistonResponse { language: string; version: string; run?: PistonStage; compile?: PistonStage }
export interface PistonRuntime { language: string; version: string; aliases?: string[] }

export function pistonBaseUrl(value: string): string {
  const raw = String(value || '').trim().replace(/\/+$/, '');
  if (raw.length > 300) throw new Error('Runner URL is too long.');
  const url = new URL(raw);
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (url.protocol !== 'https:' || url.username || url.password || url.port ||
      url.search || url.hash || url.pathname !== '/' && url.pathname !== '' ||
      !host.includes('.') || host.includes(':') ||
      /^[0-9.]+$/.test(host) ||
      /(^|\.)(localhost|local|internal|test|lan|home)$/.test(host)) {
    throw new Error('Use the HTTPS base URL of a trusted Piston execution server, with no credentials or private address.');
  }
  return 'https://' + host;
}

export function pickRuntime(runtimes: PistonRuntime[], language: string): PistonRuntime {
  const requested = String(language).trim().toLowerCase();
  const found = runtimes.find(r => r.language?.toLowerCase() === requested ||
    r.aliases?.some(alias => alias.toLowerCase() === requested));
  if (!found || !found.version || !found.language) {
    throw new Error('The selected execution server has no runtime for ' + requested + '.');
  }
  return found;
}

export function formatPistonResult(res: PistonResponse, label: string): string {
  const stage = (name: string, value?: PistonStage) => {
    if (!value) return '';
    const pass = value.code === 0 && !value.status;
    return name + ': ' + (pass ? 'PASS' : 'FAIL') + ' (exit ' + String(value.code) + ')' +
      (value.message ? ' ' + value.message.slice(0, 220) : '') +
      (value.stdout ? '\nstdout:\n' + value.stdout.slice(0, 1800) : '') +
      (value.stderr ? '\nstderr:\n' + value.stderr.slice(0, 1800) : '');
  };
  return label + '\nLanguage: ' + res.language + ' ' + res.version + '\n' +
    [stage('Build', res.compile), stage('Run', res.run)].filter(Boolean).join('\n');
}
type DirItem = { name: string; isFile(): boolean };
export async function loadRemoteProjectFiles(project: string, main: string): Promise<PistonFile[]> {
  const slug = codeProjectName(project);
  if (!/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]{0,110}$/.test(main) || !main.includes('.')) {
    throw new Error('Select a top-level source file by filename, e.g. main.py.');
  }
  const root = (await DT.workspaceDir()) + '/Code/' + slug;
  if (!(await RNFS.exists(root))) throw new Error('Code project not found: ' + slug);
  const files = (await RNFS.readDir(root)) as DirItem[];
  const eligible = files.filter(f => f.isFile() && /^[a-zA-Z0-9_-][a-zA-Z0-9_.-]{0,110}$/.test(f.name));
  const primary = eligible.find(f => f.name === main);
  if (!primary) throw new Error('Project does not contain top-level entrypoint ' + main);
  const ordered = [primary, ...eligible.filter(f => f.name !== main).slice(0, 19)];
  let total = 0;
  const loaded: PistonFile[] = [];
  for (const file of ordered) {
    const content = await RNFS.readFile(root + '/' + file.name, 'utf8');
    total += content.length;
    if (total > 120000) throw new Error('Project exceeds the 120 KB execution limit.');
    loaded.push({ name: file.name, content });
  }
  return loaded;
}
async function fetchRunner(url: string, method: 'GET' | 'POST', payload?: object): Promise<any> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 22000);
  try {
    const resp = await fetch(url, {
      method,
      redirect: 'error',
      signal: ctl.signal,
      headers: payload ? { 'Content-Type': 'application/json' } : {},
      ...(payload ? { body: JSON.stringify(payload) } : {}),
    });
    if (!resp.ok) throw new Error('Code runner returned HTTP ' + resp.status);
    return resp.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Compile/run supported languages on a trusted, user-selected HTTPS Piston server. */
export async function buildRunTestRemote(options: {
  project: string; main: string; language: string; runner_url: string; test_entry?: string;
  stdin?: string;
}): Promise<string> {
  if (offGridOn()) return 'Off-grid mode is on. No code was uploaded. Use build_run_test_code for offline JavaScript.';
  const endpoint = pistonBaseUrl(options.runner_url);
  const files = await loadRemoteProjectFiles(options.project, options.main);
  const testEntry = options.test_entry?.trim();
  if (testEntry && !files.some(f => f.name === testEntry)) {
    throw new Error('The test entrypoint must be a top-level file in the project.');
  }
  const okay = await DT.confirm('Upload and execute source code?',
    'Your source files (' + files.map(f => f.name).join(', ').slice(0,400) +
    ') will be transmitted to ' + endpoint + ' for compilation and execution. ' +
    'Do not upload secrets, personal files, or proprietary code to an untrusted runner. ' +
    'This requires a server you control or explicitly trust. Atlas will send nothing until you approve.',
    'Build and run remotely');
  if (!okay) return 'The user declined source upload. No network request was made.';
  const runtimes: PistonRuntime[] = await fetchRunner(endpoint + '/api/v2/runtimes', 'GET');
  if (!Array.isArray(runtimes)) throw new Error('Runner returned an invalid runtime list.');
  const runtime = pickRuntime(runtimes, options.language);
  const execute = async (mainFile: string): Promise<PistonResponse> => {
    const payload = {
      language: runtime.language, version: runtime.version,
      files: [files.find(f => f.name === mainFile), ...files.filter(f => f.name !== mainFile)],
      stdin: (options.stdin || '').slice(0, 3000),
      compile_timeout: 15000, run_timeout: 4000,
      compile_cpu_time: 15000, run_cpu_time: 4000,
    };
    return fetchRunner(endpoint + '/api/v2/execute', 'POST', payload);
  };
  const primary = await execute(options.main);
  const result = [formatPistonResult(primary, 'Main program: ' + options.main)];
  if (testEntry && testEntry !== options.main) {
    const tests = await execute(testEntry);
    result.push(formatPistonResult(tests, 'Test entrypoint: ' + testEntry));
  }
  return result.join('\n\n').slice(0, 7500) +
    '\n\nExecution took place on the configured external server, not inside Atlas.';
}
