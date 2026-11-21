import { deepenMessages, parseContent } from '../../../src/topics/formats';
import { useTopics } from '../../../src/topics/store';

const lesson = (text: string) => JSON.stringify({ sections: [{ heading: 'Cash', text }], keyPoints: ['k'] });

describe('readings in depth', () => {
  it('keeps a long section whole (it used to be cut at 1600 characters)', () => {
    const long = 'A sentence of the reading. '.repeat(120); // about 3,200 characters
    const c = parseContent('lesson', lesson(long)) as any;
    expect(c.sections[0].text.length).toBeGreaterThan(3000);
  });

  it('asks for paragraphs, the other headings left alone, and no citing of sources', () => {
    const m = deepenMessages({ courseTitle: 'Accounting', topic: 'Accounting', squareTitle: '1 – Cash', heading: 'Petty cash', text: 'short', others: ['Bank reconciliation'] });
    expect(m.user).toContain('4 to 7 paragraphs');
    expect(m.user).toContain('Bank reconciliation');
    expect(m.user).toMatch(/never name a book/);
  });

  it('is in depth unless the course says short, and changing it writes unread readings again but keeps played ones and other squares', () => {
    const course: any = {
      id: 'c1', topic: 't', title: 't', summary: '', style: '', theme: '', request: {}, createdAt: 1, sources: [],
      squares: [{ key: 's1', format: 'lesson', title: 'a', focus: 'a', unit: 'u' }, { key: 's2', format: 'lesson', title: 'b', focus: 'b', unit: 'u' }, { key: 's3', format: 'quiz', title: 'c', focus: 'c', unit: 'u' }],
      content: { s1: { kind: 'lesson' }, s2: { kind: 'lesson' }, s3: { kind: 'quiz' } }, progress: { s1: { stars: 3 } },
    };
    useTopics.setState({ courses: [course] });
    useTopics.getState().setReadingDepth('c1', 'standard');
    const after = useTopics.getState().courses[0];
    expect(after.readingDepth).toBe('standard');
    expect(Object.keys(after.content).sort()).toEqual(['s1', 's3']);
    useTopics.getState().setReadingDepth('c1', 'standard'); // no change: nothing is thrown away again
    expect(Object.keys(useTopics.getState().courses[0].content).sort()).toEqual(['s1', 's3']);
  });
});
