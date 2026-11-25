/**
 * "Since you last looked": what a subject gained, in a few plain lines. The numbers come from the knowledge database; nothing here is written
 * by a model, so the digest is the same however long the night's run was.
 */
import type { SubjectDigest } from './knowledgeDb';

const n = (count: number, one: string, many = `${one}s`): string => `${count.toLocaleString()} ${count === 1 ? one : many}`;

/** The digest as short lines, or an empty list when nothing happened since. */
export function digestLines(d: SubjectDigest): string[] {
  const reports = d.reports.pass + d.reports.fail + d.reports.waiting;
  const facts = Object.values(d.facts).reduce((a, b) => a + b, 0);
  if (!reports && !facts && !d.replaced) return [];
  const lines: string[] = [];
  if (reports) lines.push(`${n(reports, 'new report')}: ${d.reports.pass.toLocaleString()} passed the judge, ${d.reports.fail.toLocaleString()} did not${d.reports.waiting ? `, ${d.reports.waiting.toLocaleString()} not judged yet` : ''}.`);
  if (facts) lines.push(`${n(facts, 'new fact')} saved${d.facts.verified ? `, ${d.facts.verified.toLocaleString()} of them verified` : ''}.`);
  if (d.replaced) lines.push(`${n(d.replaced, 'older fact')} replaced because a higher or newer source said otherwise.`);
  if (d.open) lines.push(`${n(d.open, 'disagreement')} between sources still open.`);
  if (d.sources.length) lines.push(`Sources used most: ${d.sources.join('; ')}.`);
  return lines;
}
