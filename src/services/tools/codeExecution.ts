import RNFS from 'react-native-fs';
import { NativeModules, Platform } from 'react-native';
import * as DT from '../../atlasTools/deviceTools';

export interface JavascriptTest { name: string; code: string }
export interface CodeRunReport {
  ok: boolean; logs?: string[]; tests?: Array<{ name: string; passed: boolean; error?: string }>; error?: string;
}
export function codeProjectName(value: string): string {
  const normalized = String(value).trim();
  const slug = normalized.replace(/[^a-z0-9_\- ]/gi, '').replace(/\s+/g, '-').slice(0, 60);
  if (!slug || slug === '.' || slug === '..') throw new Error('Enter a valid code-project name.');
  return slug;
}

export function validatedTests(raw?: string): JavascriptTest[] {
  let tests: unknown;
  try { tests = JSON.parse(raw || '[]'); }
  catch { throw new Error('Tests must be a JSON array of {name, code}.'); }
  if (!Array.isArray(tests) || tests.length > 30) {
    throw new Error('Up to 30 JavaScript assertions are supported.');
  }
  return tests.map((test: any) => {
    if (!test || typeof test.name !== 'string' || typeof test.code !== 'string' ||
        test.name.length < 1 || test.name.length > 90 || test.code.length < 1 || test.code.length > 2500) {
      throw new Error('Each test needs a name and a JavaScript code snippet.');
    }
    return { name: test.name, code: test.code };
  });
}

interface CodeDirEntry { name: string; isFile(): boolean; isDirectory(): boolean }
export function selectedJavascriptFiles(entries: CodeDirEntry[]): string[] {
  const names = entries.filter(e => e.isFile() && /^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*\.js$/.test(e.name) &&
    !e.name.endsWith('.test.js')).map(e => e.name);
  return names.sort((a, b) => {
    const rank = (n: string) => n === 'index.js' || n === 'main.js' ? 1 : 0;
    return rank(a) - rank(b) || a.localeCompare(b);
  }).slice(0, 20);
}

/** Build a dependency-free JavaScript source bundle and run assertions on-device. */
export async function buildRunTestJavascript(project: string, rawTests = '[]'): Promise<string> {
  if (Platform.OS !== 'android' || !NativeModules.AtlasCodeRunner?.runJavascript) {
    return 'This runtime requires the latest Atlas Android APK.';
  }
  const tests = validatedTests(rawTests);
  const slug = codeProjectName(project);
  const root = (await DT.workspaceDir()) + '/Code/' + slug;
  if (!(await RNFS.exists(root))) throw new Error('Code project not found: ' + slug);
  const entries = (await RNFS.readDir(root)) as CodeDirEntry[];
  const scripts = selectedJavascriptFiles(entries);
  if (!scripts.length) return 'No top-level JavaScript files found in the project. This on-device runner supports dependency-free .js code. Compiled languages need a separate toolchain.';
  let total = '';
  for (const file of scripts) {
    const code = await RNFS.readFile(root + '/' + file, 'utf8');
    if (code.length > 120000 || total.length + code.length + 100 > 120000) {
      throw new Error('Source exceeds the 120 KB on-device runner limit.');
    }
    total += '\n// File: ' + file + '\n' + code + '\n';
  }
  // Files named *.test.js use the provided assert(expression, message) helper.
  for (const entry of entries) {
    if (!entry.isFile() || !/^[a-zA-Z0-9_.-]+\.test\.js$/.test(entry.name)) continue;
    if (tests.length >= 40) break;
    const testCode = await RNFS.readFile(root + '/' + entry.name, 'utf8');
    if (testCode.length < 1 || testCode.length > 2500) {
      throw new Error('Test file too large: ' + entry.name);
    }
    tests.push({ name: entry.name, code: testCode });
  }
  // ES modules and third-party npm packages require a bundler and are deliberately
  // unsupported by the dependency-free offline runner.
  if (/(^|\n)\s*(import|export)\s/m.test(total)) {
    throw new Error('This local runner cannot bundle import/export modules. Use simple .js scripts or an external compiler.');
  }
  const allowed = await DT.confirm('Run JavaScript project on this device?',
    'Project: ' + slug + '\nFiles: ' + scripts.join(', ') + '\nAssertions: ' + tests.length +
      '\n\nAtlas will execute this code in a temporary WebView with network, device files, and native bridges blocked. It may hang until the eight-second limit. Output will be added to the active chat.',
    'Build and run');
  if (!allowed) return 'The user declined to run the code; nothing was executed.';
  const report: CodeRunReport = JSON.parse(await NativeModules.AtlasCodeRunner.runJavascript(total, JSON.stringify(tests)));
  const rows = (report.tests || []).map(t => (t.passed ? 'PASS' : 'FAIL') + ' ' + t.name +
    (t.error ? ' — ' + t.error : ''));
  return 'JavaScript code project: ' + slug + '\n' +
    'Build: ' + (report.error ? 'failed' : 'compiled and executed') + '\n' +
    'Tests: ' + (report.tests || []).filter(t => t.passed).length + '/' + (report.tests || []).length +
    ' passed\n' + rows.join('\n').slice(0,3000) +
    (report.logs?.length ? '\nConsole:\n' + report.logs.join('\n').slice(0,1800) : '') +
    (report.error ? '\nError: ' + report.error.slice(0,1200) : '') +
    '\nThis is the isolated offline JavaScript runtime. Python, Kotlin, Rust and other languages require a separate compiler.';
}
