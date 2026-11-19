/**
 * Saves text as a Word document (.docx): headings, paragraphs, bullet lists, bold, italic, code and simple tables. A .docx is a zip of a
 * few XML files, written here directly (no library), so what goes into the XML is tested without a phone. The zip itself is made by the
 * phone's zip tool, the same one the slide export uses. Anything from a model or a document is XML-escaped.
 */
import RNFS from 'react-native-fs';
import { zip } from 'react-native-zip-archive';

const xml = (text: string): string => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c as '&']).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

interface Run { text: string; bold?: boolean; italic?: boolean; code?: boolean; size?: number }
const run = ({ text, bold, italic, code, size }: Run): string => {
  const props = `${bold ? '<w:b/>' : ''}${italic ? '<w:i/>' : ''}${code ? '<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/>' : ''}${size ? `<w:sz w:val="${size}"/>` : ''}`;
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${xml(text)}</w:t></w:r>`;
};

/** **bold**, *italic* and `code` inside a line, as runs. */
function inline(text: string, base: Omit<Run, 'text'> = {}): string {
  const out: string[] = [];
  const re = /\*\*([^*]+)\*\*|\*([^*\s][^*]*)\*|`([^`]+)`/g;
  let last = 0; let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(run({ ...base, text: text.slice(last, m.index) }));
    if (m[1] !== undefined) out.push(run({ ...base, text: m[1], bold: true }));
    else if (m[2] !== undefined) out.push(run({ ...base, text: m[2], italic: true }));
    else out.push(run({ ...base, text: m[3], code: true }));
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(run({ ...base, text: text.slice(last) }));
  return out.join('');
}

const para = (runs: string, props = ''): string => `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ''}${runs}</w:p>`;
const HEADING_SIZE: Record<number, number> = { 1: 36, 2: 30, 3: 26 };

/** One line of markdown as a Word paragraph. */
export function paragraphFor(line: string): string {
  const heading = /^(#{1,3})\s+(.*)$/.exec(line);
  if (heading) return para(inline(heading[2], { bold: true, size: HEADING_SIZE[heading[1].length] }), '<w:spacing w:before="240" w:after="80"/>');
  const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
  if (bullet) return para(run({ text: '• ' }) + inline(bullet[1]), '<w:ind w:left="540" w:hanging="270"/>');
  const numbered = /^\s*(\d{1,3})[.)]\s+(.*)$/.exec(line);
  if (numbered) return para(run({ text: `${numbered[1]}. ` }) + inline(numbered[2]), '<w:ind w:left="540" w:hanging="360"/>');
  if (/^\s*\|.*\|\s*$/.test(line)) {
    const cells = line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    if (cells.every((c) => /^:?-{2,}:?$/.test(c))) return ''; // the separator row of a table
    return para(cells.map((c, i) => (i ? '<w:r><w:tab/></w:r>' : '') + inline(c)).join(''), '<w:tabs><w:tab w:val="left" w:pos="2400"/><w:tab w:val="left" w:pos="4800"/><w:tab w:val="left" w:pos="7200"/></w:tabs>');
  }
  if (!line.trim()) return para('');
  return para(inline(line.trimEnd()), '<w:spacing w:after="120"/>');
}

/** The files of a .docx for a title and some markdown text, by path inside the zip. */
export function docxParts(title: string, markdown: string): Record<string, string> {
  const body = [para(run({ text: title || 'Atlas', bold: true, size: 44 })), ...markdown.split('\n').map(paragraphFor)].filter(Boolean).join('');
  return {
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    'word/document.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`,
  };
}

/** A file name safe on every phone. */
export const docxName = (title: string): string => `${(title || 'Atlas').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Atlas'}.docx`;

/** Writes the document into the app's cache and returns its path (share it, then delete it). */
export async function writeDocx(title: string, markdown: string): Promise<string> {
  const stamp = `${Date.now()}`;
  const temp = `${RNFS.CachesDirectoryPath}/docx-${stamp}`;
  const target = `${RNFS.CachesDirectoryPath}/${docxName(title)}`;
  try {
    for (const [file, content] of Object.entries(docxParts(title, markdown))) {
      const absolute = `${temp}/${file}`;
      await RNFS.mkdir(absolute.slice(0, absolute.lastIndexOf('/')));
      await RNFS.writeFile(absolute, content, 'utf8');
    }
    await RNFS.unlink(target).catch(() => undefined);
    await zip(temp, target);
    return target;
  } finally { await RNFS.unlink(temp).catch(() => undefined); }
}
