import { studyGuideHtml } from '../../src/topics/studyGuide';

const course: any = { id: 'c', title: 'Tax <basics>', summary: 'Learn it', theme: '', style: '', topic: 'Tax', request: {}, sources: [], createdAt: 1, progress: {},
  squares: [
    { key: 's1', format: 'lesson', title: 'Basis', focus: 'x', unit: 'Property' },
    { key: 's2', format: 'quiz', title: 'Basis quiz', focus: 'x', unit: 'Property' },
    { key: 's3', format: 'lesson', title: 'Gains', focus: 'x', unit: 'Gains' },
  ],
  content: {
    s1: { kind: 'lesson', sections: [{ heading: 'What basis is', text: 'Your cost.', example: 'Buy for 10' }], keyPoints: ['Cost plus improvements'] },
    s2: { kind: 'quiz', questions: [{ q: 'Basis is?', options: ['Cost', 'Price list'], answer: 0, why: 'It is your investment' }] },
  } };

it('makes a printable page with every written square, answers with reasons, and says what is not written yet', () => {
  const html = studyGuideHtml(course);
  expect(html).toContain('<title>Tax &lt;basics&gt;</title>');
  expect(html).toContain('<h2>Property</h2>');
  expect(html.match(/<h2>Property<\/h2>/g)).toHaveLength(1);
  expect(html).toContain('What basis is');
  expect(html).toContain('Answer: A. It is your investment');
  expect(html).toContain('Not written yet');
});
