import { docxName, docxParts, paragraphFor } from '../../src/services/docxExport';
import { lessonMarkdown } from '../../src/topics/citations';

describe('a Word document from text', () => {
  it('has the three files Word needs, with the content in document.xml', () => {
    const parts = docxParts('Leases', '# Heading\nSome **bold** and *italic* and `code`.\n- one\n- two');
    expect(Object.keys(parts).sort()).toEqual(['[Content_Types].xml', '_rels/.rels', 'word/document.xml']);
    const body = parts['word/document.xml'];
    expect(body).toContain('<w:t xml:space="preserve">Leases</w:t>');
    expect(body).toContain('<w:b/><w:sz w:val="36"/>'); // a level-1 heading is bold and larger
    expect(body).toContain('<w:b/>');
    expect(body).toContain('<w:i/>');
    expect(body).toContain('Courier New');
    expect(body.match(/• /g)).toHaveLength(2);
    expect(parts['[Content_Types].xml']).toContain('/word/document.xml');
    expect(parts['_rels/.rels']).toContain('word/document.xml');
  });

  it('escapes anything that could break the XML, and drops control characters', () => {
    const body = docxParts('A & B', 'Tom <b>&</b> "x"\u0001')['word/document.xml'];
    expect(body).toContain('A &amp; B');
    expect(body).toContain('Tom &lt;b&gt;&amp;&lt;/b&gt; &quot;x&quot;');
    expect(body).not.toContain('\u0001');
    expect(body.replace(/<[^>]+>/g, '')).not.toMatch(/[<>]/);
  });

  it('turns tables into tab-separated rows and skips the separator line', () => {
    expect(paragraphFor('| a | b |')).toContain('<w:tab/>');
    expect(paragraphFor('|---|---|')).toBe('');
    expect(paragraphFor('3) third')).toContain('3. ');
  });

  it('names the file safely', () => {
    expect(docxName('FAR: Leases / Part 2?')).toBe('FAR Leases Part 2.docx');
    expect(docxName('   ')).toBe('Atlas.docx');
  });
});

describe('a lesson as text', () => {
  const lesson = { kind: 'lesson', sections: [{ heading: 'Why', text: 'Because.', example: 'Rent is $100.' }, { text: 'No heading.' }], commonMistakes: ['Mixing up terms'], quickCheck: { q: 'What?', a: 'That.' }, keyPoints: ['One', 'Two'] } as never;
  it('lists the sections, example, mistakes, quick check and key points', () => {
    const md = lessonMarkdown(lesson);
    expect(md.startsWith('## Why')).toBe(true);
    expect(md).toContain('## Why');
    expect(md).toContain('**Example**\nRent is $100.');
    expect(md).toContain('## Common mistakes\n- Mixing up terms');
    expect(md).toContain('**Answer:** That.');
    expect(md).toContain('## Key points\n- One\n- Two');
    expect(lessonMarkdown(null)).toBe('');
    expect(lessonMarkdown({ kind: 'quiz' } as never)).toBe('');
  });
});
