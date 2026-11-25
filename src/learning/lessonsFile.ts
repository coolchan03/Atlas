/**
 * The lessons the learning loop keeps are also saved as a Markdown file in the Atlas workspace folder
 * (Learning/<name>-lessons.md), so they can be read, shared and backed up outside the app. The app's own copy
 * stays the one the assistant uses; the file is rewritten whenever the lessons change.
 */
export const lessonsFileName = (name: string): string =>
  `${(name || 'atlas').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'atlas'}-lessons.md`;

export function lessonsMarkdown(name: string, lessons: string, when: Date = new Date()): string {
  const lines = lessons.split('\n').map((l) => l.trim().replace(/^[-*]\s*/, '')).filter(Boolean);
  return [
    `# What ${name || 'Atlas'} has learned`,
    '',
    `Updated ${when.toISOString().slice(0, 16).replace('T', ' ')}. Written by the learning loop; the assistant follows these lessons.`,
    '',
    ...(lines.length ? lines.map((l) => `- ${l}`) : ['(No lessons yet.)']),
    '',
  ].join('\n');
}

export const reportsFileName = (name: string): string => lessonsFileName(name).replace(/-lessons\.md$/, '-reports.md');

/** Every report the AI wrote on a subject, in full, with what the judge said about each. */
export function reportsMarkdown(name: string, reports: Array<{ q: string; text: string; status: string; score?: number; why?: string; sources?: string; sourceList?: Array<{ n: number; title: string; kind: string; url?: string }>; at: number }>): string {
  const verdict = (r: { status: string; score?: number }) => (r.status === 'pass' ? 'Judge passed it' : r.status === 'fail' ? 'Judge failed it' : 'Not judged yet') + (r.score !== undefined ? ` (${r.score}/10)` : '');
  return [
    `# Reports on ${name || 'General'}`,
    '',
    `${reports.length} ${reports.length === 1 ? 'report' : 'reports'}, newest first.`,
    '',
    ...reports.flatMap((r) => [
      `## ${r.q}`,
      `${verdict(r)} · ${new Date(r.at).toISOString().slice(0, 16).replace('T', ' ')}`,
      '',
      r.text.trim(),
      ...(r.why ? ['', `Judge: ${r.why}`] : []),
      ...(r.sourceList?.length ? ['', '**Sources**', '', ...r.sourceList.map((s) => `${s.n}. ${s.title} (${s.kind})${s.url ? ` ${s.url}` : ''}`)]
        : r.sources ? ['', '<details><summary>Sources it had</summary>', '', r.sources.trim(), '', '</details>'] : []),
      '',
    ]),
  ].join('\n');
}

/** Saves the file. Never throws: a full disk or missing permission must not stop learning. */
export async function writeLessonsFile(name: string, lessons: string): Promise<string | null> {
  try {
    const RNFS = require('react-native-fs');
    const { workspaceDir } = require('../atlasTools/deviceTools');
    const dir = `${await workspaceDir()}/Learning`;
    await RNFS.mkdir(dir);
    const path = `${dir}/${lessonsFileName(name)}`;
    await RNFS.writeFile(path, lessonsMarkdown(name, lessons), 'utf8');
    return path;
  } catch {
    return null;
  }
}

/** Saves the reports as Learning/<name>-reports.md. Never throws. */
async function writeReportsFile(name: string, reports: Parameters<typeof reportsMarkdown>[1]): Promise<string | null> {
  try {
    const RNFS = require('react-native-fs');
    const { workspaceDir } = require('../atlasTools/deviceTools');
    const dir = `${await workspaceDir()}/Learning`;
    await RNFS.mkdir(dir);
    const path = `${dir}/${reportsFileName(name)}`;
    await RNFS.writeFile(path, reportsMarkdown(name, reports), 'utf8');
    return path;
  } catch {
    return null;
  }
}

/** The most characters of reports sent as plain text when no file can be shared. The phone's share sheet passes text through a size-limited channel, and a very long text makes it hang. */
const MAX_SHARED_TEXT = 100_000;

/**
 * Shares the reports. They are written to a file once and the file is shared (a file has no size limit that matters); only when that
 * is not possible is the text shared, cut to a size the share sheet can carry, with a line saying so. Returns how it went.
 */
export async function shareReports(name: string, reports: Parameters<typeof reportsMarkdown>[1], share: (item: { title: string; text?: string; file?: string }) => Promise<boolean>): Promise<{ how: 'file' | 'text' | 'failed'; path: string | null }> {
  const title = `Reports on ${name}`;
  const path = await writeReportsFile(name, reports);
  if (path && (await share({ title, file: path }))) return { how: 'file', path };
  const md = reportsMarkdown(name, reports);
  const text = md.length > MAX_SHARED_TEXT ? `${md.slice(0, MAX_SHARED_TEXT)}\n\n[Cut: ${md.length.toLocaleString('en-US')} characters in all. The full text is in the saved file.]` : md;
  return { how: (await share({ title, text })) ? 'text' : 'failed', path };
}
