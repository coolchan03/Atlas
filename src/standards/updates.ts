/**
 * Looking for newer versions of the sources in a project. Two steps, both on the official sites of the project's profile only (for tax: irs.gov,
 * ecfr.gov, uscode.house.gov, federalregister.gov, congress.gov, govinfo.gov and the courts' own sites; for markets, law or a custom profile: its own list):
 *   source_updates: searches for what the person asks about and says, for each page found, whether it is NEWER than a document the
 *     project already holds. "Newer" is decided here, in code, from the series and year of the two (an edition of the same work), never
 *     by the model; a page with no date is marked as unknown rather than guessed.
 *   add_source: puts one official page into the project, only after the person agrees in a dialog that shows the address. A newer
 *     edition of a work the project holds then replaces the older one in answers (taxSources.supersededEditions).
 * Nothing is added without the person, and nothing is checked against a court's later treatment: that needs a citator Atlas does not have.
 */
import { hostOf, isOfficialUrl } from './authority';
import { classifyIn, supersededIn, type SourceProfile } from './profiles';
import { classifyTaxSource, supersededEditions, type TaxKind } from './taxSources';

interface Page { title: string; url: string; snippet?: string }
export type Search = (query: string) => Promise<Array<{ title: string; url?: string; snippet?: string }>>;

/** Which official sites to look on, from what kind of source is asked about. Pure. */
function sitesFor(source: string): string[] {
  const kind: TaxKind | undefined = classifyTaxSource(source)?.kind;
  if (kind === 'court') return ['ustaxcourt.gov', 'supremecourt.gov', 'uscourts.gov'];
  if (kind === 'publicLaw') return ['congress.gov', 'govinfo.gov'];
  if (kind === 'statute') return ['uscode.house.gov', 'irs.gov'];
  if (kind === 'regulation') return ['ecfr.gov', 'federalregister.gov', 'irs.gov'];
  if (kind === 'bulletin' || kind === 'publication') return ['irs.gov'];
  return ['irs.gov', 'ecfr.gov', 'uscode.house.gov', 'federalregister.gov'];
}

/** What differs between fields: where to look, what counts as an official page, and how to tell two editions of one work apart. */
export interface Resolver {
  sites: (source: string) => string[];
  official: (url: string) => boolean;
  edition: (name: string) => { series: string; year: number } | null;
  /** Names a newer edition has replaced, among these. */
  retired: (names: string[]) => Set<string>;
}

const onSites = (url: string, sites: string[]): boolean => { const h = hostOf(url); return !!h && sites.some((s) => h === s || h.endsWith(`.${s}`)); };

/** The resolver for a project's profile; tax (and no profile at all) uses the tax sites and rules. */
export function resolverFor(profile: SourceProfile | 'federal-tax' | null): Resolver {
  if (!profile || profile === 'federal-tax') {
    return { sites: sitesFor, official: isOfficialUrl, retired: supersededEditions, edition: (n) => { const c = classifyTaxSource(n); return c?.series && c.year ? { series: c.series, year: c.year } : null; } };
  }
  return {
    sites: () => profile.sites.slice(0, 5), official: (u) => onSites(u, profile.sites), retired: (names) => supersededIn(profile, names),
    edition: (n) => { const c = classifyIn(profile, n); return c?.type.edition && c.year ? { series: `${c.type.id}:${c.series}`, year: c.year } : null; },
  };
}

/** A page's own name for classifying: its title and the file name in its address. */
const pageName = (p: Page): string => `${p.title} ${decodeURIComponent((p.url.split('?')[0].split('/').pop() ?? '')).replace(/\.[a-z]{2,4}$/i, '')}`;

/** Whether a page is a newer edition than a document held: the same series, a later year. Null when that cannot be told from the names. Pure. */
function newerThan(page: Page, held: string, res: Resolver): 'newer' | 'same' | 'older' | null {
  const a = res.edition(page.title) ?? res.edition(pageName(page));
  const b = res.edition(held);
  if (!a || !b || a.series !== b.series) return null;
  return a.year > b.year ? 'newer' : a.year === b.year ? 'same' : 'older';
}

/** Official pages for a source, each marked against the documents the project holds. Throws when every search failed (offline). */
export async function findUpdates(source: string, held: string[], via: { search: Search; res?: Resolver }): Promise<string> {
  const { search, res = resolverFor(null) } = via;
  const query = source.replace(/\s+/g, ' ').trim().slice(0, 140);
  if (!query) throw new Error('Missing required parameter: source');
  const pages = new Map<string, Page>();
  let failures = 0;
  const sites = res.sites(query);
  for (const site of sites) {
    try { for (const h of await search(`${query} site:${site}`)) if (h.url && res.official(h.url) && !pages.has(h.url)) pages.set(h.url, { title: h.title, url: h.url, snippet: h.snippet }); }
    catch { failures += 1; }
  }
  if (failures === sites.length) throw new Error('The search could not be reached (offline or blocked), so no newer sources could be looked for. Say it was not checked.');
  const heldLine = held.length ? `The project holds: ${held.slice(0, 20).join('; ')}.` : 'The project holds no documents yet.';
  if (!pages.size) return `${heldLine}\nNo page from the official sites (${sites.join(', ')}) was found for "${query}". Say that no newer source was found and that this is not proof there is none.`;
  const lines = [...pages.values()].slice(0, 8).map((p, i) => {
    const marks = held.map((h) => ({ h, v: newerThan(p, h, res) })).filter((x) => x.v);
    const verdict = marks.length ? marks.map((m) => (m.v === 'newer' ? `NEWER than "${m.h}"` : m.v === 'same' ? `the same edition as "${m.h}"` : `OLDER than "${m.h}"`)).join('; ') : 'not comparable to a held document (no matching series and year): open it and read its date before saying it is newer';
    return `${i + 1}. ${p.title}\n   ${p.url}\n   ${(p.snippet ?? '').replace(/\s+/g, ' ').slice(0, 240)}\n   Checked in code: ${verdict}`;
  });
  return `${heldLine}\nPages from the official sites about "${query}":\n\n${lines.join('\n\n')}\n\nOnly call a page newer when it says NEWER above or its date is on the page. A new law, ruling, decision, filing or announcement is new, not a newer edition: say what it is and ask whether to add it. To add a page to the project, tell the user which one and ask, then use add_source with its address. Atlas cannot check whether a case is still good law: say so.`;
}

interface AddDeps {
  held: string[];
  res?: Resolver;
  fetchPage: (url: string) => Promise<string>;
  confirm: (title: string, message: string) => Promise<boolean>;
  save: (name: string, text: string) => Promise<void>;
  now?: Date;
}

/** The name a fetched page is saved under: its heading and the site. The day it was fetched is written inside the document, not in the name, because a year in a name is read as the edition's year. Pure. */
function savedName(text: string, url: string): string {
  const heading = (text.split('\n').map((l) => l.replace(/^#+\s*/, '').trim()).find((l) => l.length >= 6) ?? 'Official source').replace(/[\\/]/g, ' ').slice(0, 60);
  return `${heading} (${hostOf(url)})`;
}

/** Adds one official page to the project after the person agrees. Returns what happened, in words the model repeats. */
export async function addSource(url: string, deps: AddDeps): Promise<string> {
  const res = deps.res ?? resolverFor(null);
  if (!res.official(url)) return `Not added: ${hostOf(url) || url} is not one of this project's official sites (${res.sites('').join(', ')}). Tell the user to add the file themselves with Add document, or to add the site to their own profile.`;
  if (/\.pdf(\?|#|$)/i.test(url)) return 'Not added: that address is a PDF, which Atlas cannot read from the web here. Tell the user to download it and add it with Add document, naming the file so it shows what it is (for example "Rev. Proc. 2025-32.pdf").';
  if (!(await deps.confirm('Add this source to the project?', `${url}\n\nThe page will be saved as a document in this project, and every chat in it will use it. Check it is the version you want.`))) return 'The user declined, so nothing was added.';
  const text = await deps.fetchPage(url);
  if (text.trim().length < 200) return 'Not added: the page had almost no readable text (it may need a browser to open). Tell the user to download it and add it with Add document.';
  const name = savedName(text, url);
  await deps.save(name, `Source: ${url}\nFetched: ${(deps.now ?? new Date()).toISOString().slice(0, 10)}\n\n${text}`);
  const stale = [...res.retired([...deps.held, name])].filter((n) => deps.held.includes(n));
  return `Added "${name}" to the project.${stale.length ? ` It is a newer edition, so these are no longer used in answers: ${stale.join('; ')}.` : ''} If the type shown under it is wrong, the user can tap it to change it. The page may be cut off if it was long.`;
}
