import { matchExam, examFolder } from '../../../src/cpa/blueprints';
import { setupCpaExam } from '../../../src/cpa/setup';
import { useCpa } from '../../../src/cpa/store';
import { useProjectStore } from '../../../src/stores/projectStore';

beforeEach(() => { useCpa.setState({ exams: {}, groupProjectId: undefined }); useProjectStore.setState({ projects: [] } as any); });

describe('an exam that is named is already known', () => {
  it.each([
    ['CFA level 1', 'CFA1'], ['cfa level II exam prep', 'CFA2'], ['Series 7', 'SERIES7'], ['the Bar exam', 'BAR'], ['CPA FAR', 'FAR'],
    ['studying for the enrolled agent exam', 'EA'], ['CMA Part 2', 'CMA2'], ['PMP prep', 'PMP'], ['usmle step 1', 'USMLE1'], ['SAT prep', 'SAT'],
  ])('%s is %s', (name, code) => { expect(matchExam(name)).toBe(code); });

  it('does not take ordinary words for an exam', () => {
    expect(matchExam('far-reaching effects of the printing press')).toBeNull();
    expect(matchExam('I sat down to learn python')).toBeNull();
    expect(matchExam('Python for beginners')).toBeNull();
  });
});

describe('every exam has a folder, made automatically', () => {
  it('shares one folder per family and gives each other exam its own', () => {
    expect(examFolder('FAR')).toMatchObject({ name: 'CPA Study', child: 'FAR: Financial Accounting and Reporting' });
    expect(examFolder('CFA2').name).toBe('CFA Study');
    expect(examFolder('SERIES7').name).toBe('Series 7 Study');
    const cfa1 = setupCpaExam('CFA1');
    const cfa2 = setupCpaExam('CFA2');
    const bar = setupCpaExam('BAR');
    const projects = useProjectStore.getState().projects;
    const folder = projects.find((p) => p.name === 'CFA Study')!;
    // The CFA levels are each a project inside one CFA Study folder; the Bar exam is a project of its own.
    expect(projects.find((p) => p.id === cfa1)?.parentId).toBe(folder.id);
    expect(projects.find((p) => p.id === cfa2)?.parentId).toBe(folder.id);
    expect(cfa1).not.toBe(cfa2);
    expect(projects.find((p) => p.id === bar)).toMatchObject({ name: 'Bar exam Study' });
    expect(projects.find((p) => p.id === bar)?.parentId).toBeUndefined();
    expect(useCpa.getState().exams.CFA1?.topics.length).toBeGreaterThan(0); // the layout is already known
  });
});

describe('review fixes', () => {
  it('moves exams on a CPA project the person chose themselves into projects inside it', () => {
    const mine = useProjectStore.getState().createProject({ name: 'My Accounting', description: '', systemPrompt: '' });
    useCpa.setState({ groupProjectId: mine.id, exams: { FAR: { projectId: mine.id, topics: [{ id: 'a::b', area: 'a', name: 'Leases', covered: false }] } } as any });
    const id = setupCpaExam('FAR');
    expect(id).not.toBe(mine.id);
    expect(useProjectStore.getState().projects.find((p) => p.id === id)?.parentId).toBe(mine.id);
  });
});
