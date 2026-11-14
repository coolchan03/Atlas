/**
 * Drug labels from the FDA's open drug label data (api.fda.gov): the text printed on a medicine's package insert. The idea and the
 * field handling come from Project NOMAD's drug reference. NOMAD downloads the whole 1.7 GB dataset to a server; a phone looks a
 * medicine up when it is online and keeps every label it has seen, so it can be read again with no signal. Labels are the
 * manufacturer's own words, never advice.
 */
export type DrugSectionKey = 'boxed_warning' | 'indications' | 'dosage' | 'contraindications' | 'warnings' | 'interactions' | 'when_using' | 'stop_use';

export const DRUG_SECTIONS: Array<{ key: DrugSectionKey; title: string }> = [
  { key: 'boxed_warning', title: 'Boxed warning' },
  { key: 'indications', title: 'What it is for' },
  { key: 'dosage', title: 'Dose and how to take it' },
  { key: 'contraindications', title: 'Do not use if' },
  { key: 'warnings', title: 'Warnings' },
  { key: 'interactions', title: 'Interactions with other drugs' },
  { key: 'when_using', title: 'When using this product' },
  { key: 'stop_use', title: 'Stop use and ask a doctor if' },
];

export interface DrugLabel {
  /** The label's own id (openFDA set_id), so a label seen twice is saved once. */
  id: string;
  brand: string;
  generic: string;
  manufacturer: string;
  /** OTC (sold without a prescription), Rx (prescription), or '' when the label does not say. */
  type: 'OTC' | 'Rx' | '';
  route: string;
  /** The label's last revision date, YYYY-MM-DD, or ''. */
  updated: string;
  sections: Partial<Record<DrugSectionKey, string>>;
}

interface OpenFdaRecord {
  set_id?: string; id?: string; effective_time?: string;
  openfda?: { brand_name?: string[]; generic_name?: string[]; manufacturer_name?: string[]; route?: string[]; product_type?: string[] };
  indications_and_usage?: string[]; dosage_and_administration?: string[]; warnings?: string[]; boxed_warning?: string[];
  drug_interactions?: string[]; contraindications?: string[]; when_using?: string[]; stop_use?: string[];
}

const clean = (arr: string[] | undefined): string => (arr ?? []).join('\n\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
const first = (arr: string[] | undefined): string => (arr?.[0] ?? '').trim();
const joined = (arr: string[] | undefined): string => (arr ?? []).map((x) => x.trim()).filter(Boolean).join(', ');
const SECTION_FIELDS: Record<DrugSectionKey, keyof OpenFdaRecord> = {
  boxed_warning: 'boxed_warning', indications: 'indications_and_usage', dosage: 'dosage_and_administration', contraindications: 'contraindications',
  warnings: 'warnings', interactions: 'drug_interactions', when_using: 'when_using', stop_use: 'stop_use',
};

/** An openFDA record as a label: the names, and every section that has text. Null for a record with no id or no name. */
export function labelFromRecord(r: OpenFdaRecord): DrugLabel | null {
  const id = r.set_id || r.id;
  const brand = first(r.openfda?.brand_name);
  const generic = joined(r.openfda?.generic_name);
  if (!id || (!brand && !generic)) return null;
  const sections: DrugLabel['sections'] = {};
  for (const { key } of DRUG_SECTIONS) {
    const text = clean(r[SECTION_FIELDS[key]] as string[] | undefined);
    if (text) sections[key] = text;
  }
  const kind = first(r.openfda?.product_type).toUpperCase();
  const t = r.effective_time ?? '';
  return {
    id, brand, generic, manufacturer: first(r.openfda?.manufacturer_name), route: joined(r.openfda?.route),
    type: kind.includes('OTC') ? 'OTC' : kind.includes('PRESCRIPTION') ? 'Rx' : '',
    updated: /^\d{8}$/.test(t) ? `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6)}` : '', sections,
  };
}

const ENDPOINT = 'https://api.fda.gov/drug/label.json';

/** Labels for a brand or generic name. Needs a connection; an unknown medicine is an empty list, any other failure throws. */
export async function searchLabels(name: string, limit = 8, fetchFn: typeof fetch = fetch): Promise<DrugLabel[]> {
  const term = name.replace(/["\\+:()]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!term) return [];
  const q = encodeURIComponent(`"${term}"`);
  const url = `${ENDPOINT}?search=openfda.brand_name:${q}+OR+openfda.generic_name:${q}&limit=${Math.max(1, Math.min(limit, 20))}`;
  const res = await fetchFn(url);
  if (res.status === 404) return []; // openFDA answers "not found" with a 404 and no results
  if (!res.ok) throw new Error(`The FDA service answered ${res.status}`);
  const body = (await res.json()) as { results?: OpenFdaRecord[] };
  const seen = new Set<string>();
  const out: DrugLabel[] = [];
  for (const rec of body.results ?? []) {
    const label = labelFromRecord(rec);
    if (label && !seen.has(label.id)) { seen.add(label.id); out.push(label); }
  }
  return out;
}

/** The labels worth showing first: prescription-free and recently revised ones before older ones, one per brand and maker. */
export function tidyLabels(labels: DrugLabel[]): DrugLabel[] {
  const seen = new Set<string>();
  return [...labels]
    .sort((a, b) => b.updated.localeCompare(a.updated))
    .filter((l) => { const k = `${l.brand}|${l.generic}|${l.manufacturer}`.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
}
