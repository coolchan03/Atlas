/** Privacy-preserving, one-request self-test for the Atlas Android app.
 * Never reads health records, sends SMS, uploads data, or creates a notification.
 */
import { NativeModules, Platform } from 'react-native';
import * as DT from '../../atlasTools/deviceTools';
import { englishWordOfDay } from '../../atlasTools/englishWordOfDay';
import {
  PRESENTATION_TEMPLATES, defaultPresentationSlides,
  type PresentationSlide,
} from '../presentationTemplates';
import { pptxParts } from '../presentationExport';

export type DiagnosticOutcome = 'pass' | 'limited' | 'fail';
export interface DiagnosticResult {
  name: string;
  status: DiagnosticOutcome;
  detail: string;
}
const one = (name: string, status: DiagnosticOutcome, detail: string): DiagnosticResult =>
  ({ name, status, detail });

async function bounded<T>(task: Promise<T>, ms: number): Promise<T> {
  let stop: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      task,
      new Promise<T>((_resolve, reject) => {
        stop = setTimeout(() => reject(new Error('Module did not respond within ' + ms + 'ms')), ms);
      }),
    ]);
  } finally {
    if (stop) clearTimeout(stop);
  }
}

/** Does not interpret unavailable hardware, permissions, or absent health records as failures. */
export async function collectReleaseDiagnostics(native = NativeModules): Promise<DiagnosticResult[]> {
  const result: DiagnosticResult[] = [];
  const add = (name: string, status: DiagnosticOutcome, detail: string) =>
    result.push(one(name, status, detail));

  // Pure local JavaScript: verify Word of the Day isn't an invented news event.
  try {
    const word = englishWordOfDay();
    add('English Word of the Day', word.word && word.meaning && word.example ? 'pass' : 'fail',
      word.word + ' (' + word.part + '): ' + word.meaning);
  } catch (err) { add('English Word of the Day', 'fail', String(err)); }

  // These are Open XML parts generated in memory. No PowerPoint file is created
  // and no file is written into user storage by this diagnostic.
  try {
    const layouts: PresentationSlide['layout'][] = [
      'title', 'bullets', 'section', 'quote', 'two_column',
      'timeline', 'infographic', 'emoji', 'closing',
    ];
    const slides = layouts.map((layout, index) => ({
      layout, title: 'Test slide ' + index, subtitle: 'Atlas source check',
      bullets: ['Alpha | Item', 'Beta | Item'],
    }));
    const parts = pptxParts(slides, PRESENTATION_TEMPLATES[0]);
    const generated = layouts.filter((_layout, index) =>
      (parts['ppt/slides/slide' + (index + 1) + '.xml'] || '').includes('<p:sp>'));
    add('Presentation templates', generated.length === layouts.length ? 'pass' : 'fail',
      generated.length + '/' + layouts.length + ' slide layouts produced editable XML');
  } catch (err) { add('Presentation templates', 'fail', String(err)); }

  const pdf = native.AtlasPresentationExporter;
  add('PDF exporter', typeof pdf?.exportPdf === 'function' ? 'pass' : 'fail',
    typeof pdf?.exportPdf === 'function'
      ? 'Native PDF exporter is registered; creating a file still needs an output test'
      : 'Android PDF exporter is missing');

  const environment = native.AtlasEnvironment;
  if (!environment?.snapshot) {
    add('Environmental sensors', 'fail', 'Native module missing');
  } else {
    try {
      const s: any = await bounded(environment.snapshot(), 7000);
      const sensors = s?.sensors || {};
      const pressure = typeof s.pressureHpa === 'number' ? s.pressureHpa.toFixed(1) + ' hPa'
        : sensors.pressure ? 'available (no new sample)' : 'sensor not installed';
      const ambient = typeof s.ambientTemperatureC === 'number' ? s.ambientTemperatureC.toFixed(1) + ' C'
        : sensors.ambientTemperature ? 'available (no new sample)' : 'sensor not installed';
      const trend = typeof s.temperatureChangeCPerHour === 'number'
        ? s.temperatureChangeCPerHour.toFixed(2) + ' C/hour'
        : 'requires another sample 5+ minutes later';
      add('Environmental sensors', s?.wifi && s?.bluetooth ? 'pass' : 'fail',
        'Wi-Fi and Bluetooth state; pressure ' + pressure + '; ambient temperature ' +
        ambient + '; trend ' + trend);
    } catch (err) { add('Environmental sensors', 'fail', String(err)); }
  }

  // Status only: never reads the user's steps or heart-rate records.
  const health = native.AtlasHealthConnect;
  if (!health?.status) add('Health Connect', 'fail', 'Health Connect native module missing');
  else {
    try {
      const status: any = await bounded(health.status(), 4000);
      add('Health Connect', status?.available ? 'pass' : 'limited',
        status?.available
          ? (status?.permissions?.steps ? 'Steps permission granted' : 'Steps permission not yet granted')
          : 'Health Connect unavailable on this Android installation');
    } catch (err) { add('Health Connect', 'fail', String(err)); }
  }

  // Metadata only. This does not reveal recipients, message bodies or draft keys.
  const drafts = native.AtlasScheduledDrafts;
  if (!drafts?.list) add('Scheduled text drafts', 'fail', 'Scheduler module missing');
  else {
    try {
      const pending = await bounded(drafts.list(), 5000);
      add('Scheduled text drafts', Array.isArray(pending) ? 'pass' : 'fail',
        Array.isArray(pending) ? 'Scheduler responding; pending jobs: ' + pending.length :
          'Scheduled work did not return a list');
    } catch (err) { add('Scheduled text drafts', 'fail', String(err)); }
  }

  const code = native.AtlasCodeRunner;
  if (!code?.runJavascript) add('Local JavaScript runner', 'fail', 'Native runner missing');
  else {
    try {
      const raw = await bounded(code.runJavascript(
        "console.log('Atlas code runner smoke'); assert(2 + 3 === 5, 'Math smoke');",
        '[{"name":"arithmetic","code":"assert(2*3===6)"}]',
      ), 11500);
      const report: any = JSON.parse(String(raw));
      const passed = report?.ok && report?.tests?.length === 1 && report.tests[0].passed;
      add('Local JavaScript runner', passed ? 'pass' : 'fail',
        passed ? 'Executed built-in smoke script and assertion in restricted WebView'
          : 'Engine returned an unsuccessful result');
    } catch (err) { add('Local JavaScript runner', 'fail', String(err)); }
  }
  return result;
}

export function formatReleaseDiagnostics(items: DiagnosticResult[]): string {
  const pass = items.filter(t => t.status === 'pass').length;
  const fail = items.filter(t => t.status === 'fail').length;
  const limited = items.filter(t => t.status === 'limited').length;
  return 'Atlas native release self-test: ' + pass + ' pass, ' +
    limited + ' limited, ' + fail + ' fail\n' +
    items.map(t => (t.status === 'pass' ? 'PASS' : t.status === 'limited' ? 'LIMITED' : 'FAIL') +
      ' — ' + t.name + ': ' + t.detail).join('\n') +
    '\nNo personal health records were read, no messages were sent, and no files were exported.' +
    '\nAn automated self-test cannot replace physical notification, UI and APK installation checks.';
}

export async function runReleaseDiagnostics(): Promise<string> {
  if (Platform.OS !== 'android') return 'The Atlas release self-test requires Android.';
  const approved = await DT.confirm('Run Atlas release self-test?',
    'Check local calendar-independent English vocabulary, PowerPoint XML, native PDF registration, ' +
    'device sensors, Health Connect permission STATUS (no records), scheduled-draft job counts ' +
    '(no message content), and a fixed, local JavaScript test. Nothing is uploaded or sent.',
    'Run self-test');
  if (!approved) return 'The user cancelled release diagnostics.';
  return formatReleaseDiagnostics(await collectReleaseDiagnostics());
}
