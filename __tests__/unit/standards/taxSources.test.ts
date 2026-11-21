import { classifyTaxSource, supersededEditions, taxLabel, hasTaxSources } from '../../../src/standards/taxSources';
import { overrules } from '../../../src/standards/authority';

describe('tax sources by name', () => {
  it.each([
    ['Title 26 - Internal Revenue Code.pdf', 'statute'],
    ['26 CFR Part 1 (2025).pdf', 'regulation'],
    ['irb24-31.pdf', 'bulletin'],
    ['Rev. Proc. 2024-40.pdf', 'bulletin'],
    ['IRS Pub 17 (2024).pdf', 'publication'],
    ['p535_2023.pdf', 'publication'],
  ])('%s is a %s', (name, kind) => { expect(classifyTaxSource(name)?.kind).toBe(kind); });

  it('does not treat an ordinary textbook as tax law', () => {
    expect(classifyTaxSource('Federal Taxation 2025 Comprehensive.pdf')).toBeNull();
    expect(hasTaxSources(['Notes.pdf'])).toBe(false);
  });

  it('keeps only the newest edition of one publication', () => {
    const old = supersededEditions(['IRS Pub 17 (2023).pdf', 'IRS Pub 17 (2024).pdf', 'IRS Pub 535 (2023).pdf']);
    expect([...old]).toEqual(['IRS Pub 17 (2023).pdf']);
    expect(taxLabel('IRS Pub 17 (2024).pdf')).toBe('IRS publication, 2024');
  });
});

describe('which source wins', () => {
  const src = (title: string) => ({ kind: 'project' as const, title });
  it('the Code beats a publication, a regulation beats a publication, a textbook loses to all', () => {
    expect(overrules([src('Title 26 IRC.pdf')], [src('IRS Pub 17 (2024).pdf')])).toBe(true);
    expect(overrules([src('26 CFR Part 1.pdf')], [src('IRS Pub 17 (2024).pdf')])).toBe(true);
    expect(overrules([src('IRS Pub 17 (2024).pdf')], [src('Textbook.pdf')])).toBe(true);
    expect(overrules([src('Textbook.pdf')], [src('IRS Pub 17 (2024).pdf')])).toBe(false);
  });
  it('a later edition beats an earlier one of the same rank', () => {
    expect(overrules([src('IRS Pub 17 (2024).pdf')], [src('IRS Pub 502 (2022).pdf')])).toBe(true);
    expect(overrules([src('IRS Pub 502 (2022).pdf')], [src('IRS Pub 17 (2024).pdf')])).toBe(false);
  });
});
