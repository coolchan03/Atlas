import { convertForIndexing, csvToMarkdown, htmlToMarkdown, normalizeText, stripRunningHeaders } from '../../../src/services/rag/convert';
import { structureAwareChunks, tableChunks } from '../../../src/services/rag/structure';

describe('conversion keeps what the document says', () => {
  it('repairs encoding and leaves hyphenated line breaks as written', () => {
    const r = normalizeText('Itâ\u0080\u0099s a trans-\nfer of well-\nknown Â§ 162 rules.');
    expect(r.text).toBe('It’s a trans-\nfer of well-\nknown § 162 rules.');
    expect(r.notes.join()).toMatch(/encoding/);
  });
  it('removes only lines repeated on most pages, and says how many', () => {
    const pages = [1, 2, 3, 4, 5].map((n) => `ACME Manual  Page ${n}\nUnique text number ${n} stays.`).join('\f');
    const r = stripRunningHeaders(pages);
    expect(r.text).not.toMatch(/ACME Manual/);
    expect(r.text).toContain('Unique text number 3 stays.');
    expect(r.notes[0]).toMatch(/removed 5 repeated/);
  });
  it('turns a web page into Markdown, drops navigation and keeps tables and links', () => {
    const r = htmlToMarkdown('<html><head><title>Guide</title></head><body><nav>Home | About</nav><h2>Rules</h2><p>See <a href="https://x.gov/a">the rule</a> &amp; more.</p><table><tr><th>Year</th><th>Rate</th></tr><tr><td>2020</td><td>10%</td></tr></table><footer>(c) site</footer></body></html>');
    expect(r.text).toContain('## Rules');
    expect(r.text).toContain('[the rule](https://x.gov/a) & more.');
    expect(r.text).toContain('| 2020 | 10% |');
    expect(r.text).not.toMatch(/Home \| About|\(c\) site/);
    expect(r.notes.join()).toMatch(/navigation/);
  });
  it('keeps every CSV row, quotes and commas included', () => {
    const r = csvToMarkdown('name,note\n"Smith, J","said ""hi"""\nLee,ok\n');
    expect(r.text.split('\n').length).toBe(4);
    expect(r.text).toContain('| Smith, J | said "hi" |');
  });
  it('picks the converter from the file type', () => {
    expect(convertForIndexing('a.csv', 'a,b\n1,2').format).toBe('markdown');
    expect(convertForIndexing('a.txt', 'plain words here').format).toBe('text');
  });
});

describe('structure-aware segmentation', () => {
  const law = ['§ 101. Definitions', 'In this part the term "widget" means a thing.', '', '§ 102. Exceptions', 'A widget is exempt when used at home. '.repeat(30), '', '§ 103. Effective date', 'This applies to years after 2019.'].join('\n');
  it('splits at provisions and labels every passage with its section', () => {
    const chunks = structureAwareChunks(law)!;
    expect(chunks.every((c) => /^\[§ 10[123]/.test(c.content))).toBe(true);
    expect(chunks.filter((c) => c.content.startsWith('[§ 102')).length).toBeGreaterThan(1);
    expect(chunks.map((c) => c.position)).toEqual(chunks.map((_, i) => i));
    expect(chunks.map((c) => c.content).join(' ')).toContain('after 2019');
  });
  it('leaves documents without structure to the ordinary chunking', () => {
    expect(structureAwareChunks('Just some prose.\n\nMore prose without any markers at all.')).toBeNull();
  });
  it('repeats a table\'s header on every piece', () => {
    const table = ['| a | b |', '| --- | --- |', ...Array.from({ length: 60 }, (_, i) => `| row${i} | value${i} |`)].join('\n');
    const parts = tableChunks(table, 400);
    expect(parts.length).toBeGreaterThan(2);
    expect(parts.every((p) => p.startsWith('| a | b |\n| --- | --- |'))).toBe(true);
    expect(parts.join('\n')).toContain('row59');
  });
});
