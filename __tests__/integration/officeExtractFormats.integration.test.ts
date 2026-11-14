import { installNativeBoundary } from '../harness/nativeBoundary';

const b64 = (s: string) => Buffer.from(s).toString('base64');
const zipOf = async (path: string, files: Record<string, string>) => {
  const RNFS = require('react-native-fs');
  await RNFS.mkdir('/in');
  await RNFS.writeFile(path, JSON.stringify({ files: Object.fromEntries(Object.entries(files).map(([k, v]) => [k, b64(v)])) }), 'utf8');
};
const text = (t: string) => `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`;

describe('office and ebook files are read as plain text and as Markdown', () => {
  let ext: typeof import('../../src/services/officeExtract');
  beforeEach(() => { installNativeBoundary({ fs: true }); jest.resetModules(); ext = require('../../src/services/officeExtract'); });

  it('reads a Word file with tabs, breaks and a table, and decodes entities', async () => {
    await zipOf('/in/a.docx', { 'word/document.xml': `<w:document><w:body>${text('Tom &amp; Jerry &#65; &#x42; &nbsp;done')}<w:p><w:r><w:t>a</w:t></w:r><w:tab/><w:r><w:t>b</w:t></w:r><w:br/></w:p><w:tbl><w:tr><w:tc>${text('Cell1')}</w:tc><w:tc>${text('Cell2')}</w:tc></w:tr></w:tbl></w:body></w:document>` });
    const out = await ext.extractOffice('/in/a.docx', '.docx', 10_000);
    expect(out).toContain('Tom & Jerry A B'); expect(out).toContain('a\tb'); expect(out).toContain('Cell1');
    expect((await ext.extractOfficeMarkdown('/in/a.docx', '.docx', 10_000)).length).toBeGreaterThan(5);
  });
  it('truncates long text and refuses a file with no text', async () => {
    await zipOf('/in/long.docx', { 'word/document.xml': text('x'.repeat(500)) });
    expect(await ext.extractOffice('/in/long.docx', '.docx', 100)).toMatch(/Content truncated/);
    expect(await ext.extractOfficeMarkdown('/in/long.docx', '.docx', 100)).toMatch(/Content truncated/);
    await zipOf('/in/empty.docx', { 'word/document.xml': '<w:document/>' });
    await expect(ext.extractOffice('/in/empty.docx', '.docx', 100)).rejects.toThrow(/only pictures/);
    await expect(ext.extractOfficeMarkdown('/in/empty.docx', '.docx', 100)).rejects.toThrow(/only pictures/);
  });
  it('reads slides in order with their notes, and a deck with no slides is empty', async () => {
    await zipOf('/in/d.pptx', {
      'ppt/slides/slide2.xml': '<a:p><a:t>Second slide</a:t></a:p>', 'ppt/slides/slide1.xml': '<a:p><a:t>First title</a:t></a:p><a:p><a:t>Point</a:t></a:p>',
      'ppt/notesSlides/notesSlide1.xml': '<a:p><a:t>Remember this</a:t></a:p><a:p><a:t>1</a:t></a:p>', 'ppt/slides/readme.txt': 'ignored',
    });
    const out = await ext.extractOffice('/in/d.pptx', '.pptx', 10_000);
    expect(out.indexOf('Slide 1')).toBeLessThan(out.indexOf('Slide 2')); expect(out).toContain('(Notes: Remember this)');
    expect(await ext.extractOfficeMarkdown('/in/d.pptx', '.pptx', 10_000)).toContain('First title');
    await zipOf('/in/none.pptx', { 'ppt/other.xml': 'x' });
    await expect(ext.extractOffice('/in/none.pptx', '.pptx', 100)).rejects.toThrow(/No text/);
    await expect(ext.extractOfficeMarkdown('/in/none.pptx', '.pptx', 100)).rejects.toThrow(/No text/);
  });
  it('reads a workbook: shared and inline strings, gaps, quoted cells, sheet names', async () => {
    await zipOf('/in/w.xlsx', {
      'xl/sharedStrings.xml': '<sst><si><t>Name</t></si><si><t>Amount, USD</t></si><si><t>Say "hi"</t></si></sst>',
      'xl/workbook.xml': '<workbook><sheets><sheet name="Budget &amp; Plan" sheetId="1"/></sheets></workbook>',
      'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row><row r="2"><c r="A2"><v>12.5</v></c><c r="B2" t="inlineStr"><is><t>inline</t></is></c><c r="C2" t="s"><v>2</v></c></row><row r="3"/><row r="4"><c><v>7</v></c></row></sheetData></worksheet>',
    });
    const out = await ext.extractOffice('/in/w.xlsx', '.xlsx', 10_000);
    expect(out).toContain('--- Sheet: Budget & Plan ---'); expect(out).toContain('Name,,"Amount, USD"'); expect(out).toContain('"Say ""hi"""'); expect(out).toContain('12.5,inline');
    expect(await ext.extractOfficeMarkdown('/in/w.xlsx', '.xlsx', 10_000)).toContain('Budget & Plan');
    await zipOf('/in/nosheets.xlsx', { 'xl/workbook.xml': '<workbook/>' });
    await expect(ext.extractOffice('/in/nosheets.xlsx', '.xlsx', 100)).rejects.toThrow(/No text/);
  });
  it('reads OpenDocument text', async () => {
    await zipOf('/in/t.odt', { 'content.xml': '<office:text><text:h>Title</text:h><text:p>Line<text:tab/>tab<text:line-break/>next</text:p></office:text>' });
    const out = await ext.extractOffice('/in/t.odt', '.odt', 1000);
    expect(out).toContain('Title'); expect(out).toContain('Line\ttab');
    expect(await ext.extractOfficeMarkdown('/in/t.odt', '.odt', 1000)).toContain('Title');
  });
  it('reads an ebook in reading order, skipping scripts and unsafe links', async () => {
    await zipOf('/in/b.epub', {
      'META-INF/container.xml': '<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>',
      'OEBPS/content.opf': '<package><manifest><item id="c1" href="ch1.xhtml"/><item id="c2" href="ch%202.xhtml"/><item id="bad" href="../secret.xhtml"/></manifest><spine><itemref idref="c2"/><itemref idref="c1"/><itemref idref="bad"/></spine></package>',
      'OEBPS/ch1.xhtml': '<html><body><h1>Chapter One</h1><p>Hello<br/>world</p><script>evil()</script></body></html>',
      'OEBPS/ch 2.xhtml': '<html><body><p>Preface text</p></body></html>',
    });
    const out = await ext.extractOffice('/in/b.epub', '.epub', 10_000);
    expect(out.indexOf('Preface')).toBeLessThan(out.indexOf('Chapter One')); expect(out).not.toContain('evil');
    expect(await ext.extractOfficeMarkdown('/in/b.epub', '.epub', 10_000)).toContain('Chapter One');
    await zipOf('/in/nocontainer.epub', { 'x.txt': 'x' });
    await expect(ext.extractOffice('/in/nocontainer.epub', '.epub', 100)).rejects.toThrow(/No text/);
  });
  it('reads RTF: drops header groups, decodes escapes, keeps paragraphs', async () => {
    const RNFS = require('react-native-fs');
    await RNFS.mkdir('/in');
    const rtf = ['{\\rtf1\\ansi{\\fonttbl{\\f0 Arial;}}{\\colortbl;\\red0;}{\\*\\generator Word;}\\pard Caf\\\'e9 \\u8364? done\\par\\line next\\tab tabbed\\\\ end}'].join('');
    await RNFS.writeFile('/in/n.rtf', rtf, 'utf8');
    const out = await ext.extractOffice('/in/n.rtf', '.rtf', 1000);
    expect(out).toContain('Café'); expect(out).toContain('€'); expect(out).not.toContain('Arial'); expect(out).not.toContain('generator');
    expect(await ext.extractOfficeMarkdown('/in/n.rtf', '.rtf', 5)).toHaveLength(5);
  });
});
